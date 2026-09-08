import {
  DemoDocument,
  StepDocument,
  TourManifest,
  StepManifest,
  DOMSnapshot,
  uploadManifestToR2,
  uploadDOMSnapshotToR2,
  APP_INDEXNOW_CONFIG
} from '@serverless-tour/common';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch
} from 'firebase/firestore';
import {
  db,
  auth,
  storage,
  callGetPresignedUploadUrl,
  callPublishTourManifest,
  callUnpublishTourManifest,
  uploadSnapshotToFirebaseStorage,
  downloadSnapshotFromFirebaseStorage,
  deleteDemoFromFirebaseStorage,
  callDeleteTourAssets
} from './firebase';
import { getR2Config, isR2Configured, isFirebaseConfigured } from './configService';
import {
  getIdbSnapshot,
  saveIdbSnapshot,
  getIdbSnapshotAny,
  findMatchingIdbSnapshot,
  getAllIdbSnapshotsForDemo,
  getIdbDraft,
  saveIdbDraft,
  deleteIdbDraft,
  deleteIdbSnapshotsForDemo
} from './indexedDbService';

const LOCAL_STORAGE_DEMOS_KEY = 'serverless_tour_demos_db';
const LOCAL_STORAGE_STEPS_KEY = 'serverless_tour_steps_db';
const LOCAL_STORAGE_SNAPSHOTS_KEY = 'serverless_tour_snapshots_db';
const DELETED_DEMOS_KEY = 'navigate_deleted_demos_tombstones';

/**
 * Check if a demo ID has been deleted in the current session (tombstone guard)
 */
export function isDemoDeleted(demoId: string): boolean {
  if (!demoId) return false;
  try {
    const raw = sessionStorage.getItem(DELETED_DEMOS_KEY);
    if (!raw) return false;
    const list: string[] = JSON.parse(raw);
    return list.includes(demoId);
  } catch {
    return false;
  }
}

/**
 * Record a demo ID in session tombstones to prevent resurrecting from delayed network/cache snapshots
 */
export function markDemoDeleted(demoId: string): void {
  if (!demoId) return;
  try {
    const raw = sessionStorage.getItem(DELETED_DEMOS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(demoId)) {
      list.push(demoId);
      sessionStorage.setItem(DELETED_DEMOS_KEY, JSON.stringify(list));
    }
  } catch {}
}

/**
 * Reserved URL slugs that must not collide with system routes in App.tsx
 */
export const RESERVED_SLUGS = ['admin', 'view', 'auth', 'studio', 'terms', 'privacy', 'login', 'api', 'static'];

/**
 * Validate a custom slug for uniqueness against reserved system routes
 */
export function validateSlug(slug: string): { valid: boolean; reason?: string } {
  if (!slug || slug.trim().length === 0) {
    return { valid: false, reason: 'Slug cannot be empty.' };
  }
  const clean = slug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(clean)) {
    return { valid: false, reason: 'Slug can only contain lowercase letters, numbers, and hyphens.' };
  }
  if (RESERVED_SLUGS.includes(clean)) {
    return { valid: false, reason: `"${clean}" is a reserved system path. Try "${clean}-guide" instead.` };
  }
  return { valid: true };
}

// Local change listeners for offline cache synchronization
const localChangeListeners: Set<() => void> = new Set();
function notifyLocalChange() {
  localChangeListeners.forEach((fn) => fn());
}

/**
 * Get all demos
 */
export async function getDemos(authorId?: string): Promise<DemoDocument[]> {
  const firestoreDemos: DemoDocument[] = [];
  if (db && isFirebaseConfigured()) {
    try {
      const q = authorId
        ? query(collection(db, 'demos'), where('authorId', '==', authorId), orderBy('updatedAt', 'desc'))
        : query(collection(db, 'demos'), orderBy('updatedAt', 'desc'));
      const snapshot = await getDocs(q);
      firestoreDemos.push(
        ...snapshot.docs
          .filter((d) => !isDemoDeleted(d.id))
          .map((d) => ({ id: d.id, ...d.data() } as DemoDocument))
      );
    } catch (e) {
      console.warn('Firestore fetch failed, using local store:', e);
    }
  }

  const raw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
  if (!raw) return firestoreDemos;
  try {
    const map: Record<string, DemoDocument> = JSON.parse(raw);
    for (const localDemo of Object.values(map)) {
      if (isDemoDeleted(localDemo.id)) continue;
      if (!firestoreDemos.some((d) => d.id === localDemo.id)) {
        firestoreDemos.push(localDemo);
      }
    }
  } catch {}
  return firestoreDemos.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/**
 * Subscribe to realtime demo updates
 */
export function subscribeDemos(authorId: string | undefined, callback: (demos: DemoDocument[]) => void): () => void {
  const mergeLocalDemos = (firestoreDemos: DemoDocument[]): DemoDocument[] => {
    const combined = [...firestoreDemos];
    const raw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
    if (raw) {
      try {
        const localMap: Record<string, DemoDocument> = JSON.parse(raw);
        for (const localDemo of Object.values(localMap)) {
          if (isDemoDeleted(localDemo.id)) continue;
          const exists = combined.some((d) => d.id === localDemo.id || (d.slug && d.slug === localDemo.slug));
          if (!exists) {
            combined.push(localDemo);

            // Auto-sync local draft to Firestore in background — only when authenticated
            if (db && isFirebaseConfigured() && auth?.currentUser) {
              const cleanDemo = {
                ...localDemo,
                authorId: localDemo.authorId === 'local_creator' ? (authorId || 'creator') : (localDemo.authorId || authorId || 'creator')
              };
              setDoc(doc(db, 'demos', localDemo.id), cleanDemo, { merge: true }).catch(() => {});

              // Also sync steps from local storage to Firestore
              const stepsRaw = localStorage.getItem(LOCAL_STORAGE_STEPS_KEY);
              if (stepsRaw) {
                try {
                  const stepsMap: Record<string, StepDocument[]> = JSON.parse(stepsRaw);
                  const localSteps = stepsMap[localDemo.id];
                  if (localSteps && localSteps.length > 0) {
                    for (const st of localSteps) {
                      setDoc(doc(db, 'demos', localDemo.id, 'steps', st.id), st, { merge: true }).catch(() => {});
                    }
                  }
                } catch {}
              }
            }
          }
        }
      } catch {}
    }
    return combined.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  };

  if (db && isFirebaseConfigured()) {
    const q = collection(db, 'demos');

    let currentFirestoreDemos: DemoDocument[] = [];
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        currentFirestoreDemos = snapshot.docs
          .filter((d) => !isDemoDeleted(d.id))
          .map((d) => ({ id: d.id, ...d.data() } as DemoDocument));
        callback(mergeLocalDemos(currentFirestoreDemos));
      },
      (err) => {
        console.warn('Firestore subscription notice, falling back to local store:', err);
        callback(mergeLocalDemos([]));
      }
    );

    const onLocal = () => {
      callback(mergeLocalDemos(currentFirestoreDemos));
    };
    localChangeListeners.add(onLocal);

    return () => {
      unsub();
      localChangeListeners.delete(onLocal);
    };
  }

  const update = () => {
    callback(mergeLocalDemos([]));
  };

  update();
  localChangeListeners.add(update);
  return () => localChangeListeners.delete(update);
}

/**
 * Get a specific demo by ID
 */
/**
 * Helper to generate URL-safe slug from title.
 * Automatically appends '-guide' if the generated slug collides with a reserved system route.
 */
export function generateSlugFromTitle(title: string): string {
  const raw = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return RESERVED_SLUGS.includes(raw) ? `${raw}-guide` : raw;
}

/**
 * Fetch a single Demo by ID or Slug
 */
export async function getDemo(demoIdOrSlug: string): Promise<DemoDocument | null> {
  if (isDemoDeleted(demoIdOrSlug)) return null;

  if (db && isFirebaseConfigured()) {
    try {
      const docRef = doc(db, 'demos', demoIdOrSlug);
      const snapshot = await getDoc(docRef);
      if (snapshot.exists()) {
        return { id: snapshot.id, ...snapshot.data() } as DemoDocument;
      }

      // Check by slug in Firestore
      const q = query(collection(db, 'demos'), where('slug', '==', demoIdOrSlug));
      const qSnap = await getDocs(q);
      if (!qSnap.empty) {
        const first = qSnap.docs[0];
        return { id: first.id, ...first.data() } as DemoDocument;
      }
    } catch (e) {
      console.warn('Firestore getDoc/query failed:', e);
    }
  }

  const raw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
  if (raw) {
    const map: Record<string, DemoDocument> = JSON.parse(raw);
    if (map[demoIdOrSlug]) return map[demoIdOrSlug];
    const foundBySlug = Object.values(map).find((d) => d.slug === demoIdOrSlug);
    if (foundBySlug) return foundBySlug;
  }

  // Fallback: Check high-capacity IndexedDB
  const idbDraft = await getIdbDraft(demoIdOrSlug);
  if (idbDraft?.demo) return idbDraft.demo;

  return null;
}

/**
 * Create a new Demo
 */
export async function createDemo(
  title: string,
  description = '',
  authorId = 'author_admin_local',
  authorEmail = ''
): Promise<DemoDocument> {
  const demoId = `demo_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  const slug = generateSlugFromTitle(title) || demoId;
  const newDemo: DemoDocument = {
    id: demoId,
    title,
    slug,
    description,
    authorId,
    authorEmail,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    stepOrder: [],
    isPublished: false,
    tags: ['Draft'],
    theme: {
      primaryColor: '#0c3c60',
      badgeColor: '#38bdf8',
      showBackdrop: true,
      showStepCount: true,
      pulseAnimation: true
    },
    defaultStepSettings: {
      stepType: 'tooltip',
      themeColor: '#0c3c60',
      tooltipDefaults: {
        cardStyle: 'solid',
        placement: 'bottom',
        targetHighlight: 'none',
        focusBackdrop: 'none',
        showBeacon: true,
        beaconConfig: {
          alignment: 'center',
          style: 'pulse'
        }
      },
      beaconDefaults: {
        alignment: 'center',
        style: 'pulse',
        targetHighlight: 'none',
        focusBackdrop: 'none'
      },
      modalDefaults: {
        cardStyle: 'solid',
        focusBackdrop: 'dim'
      },
      cardStyle: 'solid',
      focusBackdrop: 'none',
      targetHighlight: 'none',
      placement: 'bottom',
      showBeacon: true,
      beaconConfig: {
        alignment: 'center',
        style: 'pulse'
      }
    }
  };

  if (db && isFirebaseConfigured()) {
    try {
      await setDoc(doc(db, 'demos', demoId), newDemo);
      return newDemo;
    } catch (e) {
      console.warn('Firestore createDemo failed, saving locally:', e);
    }
  }

  const raw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
  const map: Record<string, DemoDocument> = raw ? JSON.parse(raw) : {};
  map[demoId] = newDemo;
  localStorage.setItem(LOCAL_STORAGE_DEMOS_KEY, JSON.stringify(map));

  const stepsRaw = localStorage.getItem(LOCAL_STORAGE_STEPS_KEY);
  const stepsMap: Record<string, StepDocument[]> = stepsRaw ? JSON.parse(stepsRaw) : {};
  stepsMap[demoId] = [];
  localStorage.setItem(LOCAL_STORAGE_STEPS_KEY, JSON.stringify(stepsMap));

  notifyLocalChange();
  return newDemo;
}

/**
 * Update demo metadata
 */
export async function updateDemo(demoId: string, updates: Partial<DemoDocument>): Promise<void> {
  // Strip undefined values — Firestore rejects them with "Unsupported field value: undefined"
  const stripUndefined = <T extends object>(obj: T): T => {
    const result: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        result[k] = v !== null && typeof v === 'object' && !Array.isArray(v) ? stripUndefined(v) : v;
      }
    }
    return result as T;
  };
  const cleanUpdates = stripUndefined({ ...updates, updatedAt: Date.now() });

  if (db && isFirebaseConfigured()) {
    try {
      const setDocPromise = setDoc(doc(db, 'demos', demoId), cleanUpdates, { merge: true });
      const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10000));
      const res = await Promise.race([setDocPromise, timeoutPromise]);
      if (res === 'timeout') {
        console.warn('Firestore updateDemo timed out after 10s. Changes are saved locally.');
      }
    } catch (e) {
      console.warn('Firestore setDoc failed, saving locally:', e);
    }
  }

  const raw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
  const map: Record<string, DemoDocument> = raw ? JSON.parse(raw) : {};
  map[demoId] = { ...(map[demoId] || { id: demoId, title: 'Walkthrough', stepOrder: [], isPublished: false }), ...cleanUpdates };
  localStorage.setItem(LOCAL_STORAGE_DEMOS_KEY, JSON.stringify(map));
  notifyLocalChange();
}

/**
 * Delete a demo and all its steps
 */
export async function deleteDemo(demoId: string): Promise<void> {
  // 1. Immediately record in session tombstones to prevent resurrection from delayed snapshots
  markDemoDeleted(demoId);

  // 2. Immediate direct client-side Firestore document deletion
  // This synchronously updates Firestore SDK's local client cache so any immediate read sees it deleted
  if (db && isFirebaseConfigured()) {
    try {
      const deleteDocPromise = deleteDoc(doc(db, 'demos', demoId));
      const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 8000));
      await Promise.race([deleteDocPromise, timeoutPromise]);
    } catch (e) {
      console.warn('Direct client-side deleteDoc notice:', e);
    }
  }

  // 3. Invoke Cloud Function deleteTourAssets to completely wipe server-side infrastructure:
  // (R2 manifest + all snapshots, Storage drafts, subcollections, and re-sync catalog.json)
  let cloudFunctionSucceeded = false;
  if (isFirebaseConfigured()) {
    try {
      const res = await callDeleteTourAssets(demoId);
      if (res && res.success) {
        cloudFunctionSucceeded = true;
      }
    } catch (e) {
      console.warn('callDeleteTourAssets error:', e);
    }

    // 3b. Robust Fallback: If Cloud Function was unavailable or errored, execute deep client-side cleanup
    if (!cloudFunctionSucceeded && db) {
      console.info(`[deleteDemo] Executing client-side fallback cleanup for ${demoId}`);
      try {
        // Batch delete steps subcollection
        const stepsSnapshot = await getDocs(collection(db, 'demos', demoId, 'steps'));
        if (!stepsSnapshot.empty) {
          const batch = writeBatch(db);
          stepsSnapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
          await batch.commit();
        }
      } catch (e) {
        console.warn('Client-side step subcollection delete fallback notice:', e);
      }

      try {
        // Batch delete snapshots subcollection
        const snapsSnapshot = await getDocs(collection(db, 'demos', demoId, 'snapshots'));
        if (!snapsSnapshot.empty) {
          const batch = writeBatch(db);
          snapsSnapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
          await batch.commit();
        }
      } catch (e) {
        console.warn('Client-side snapshots subcollection delete fallback notice:', e);
      }

      // Re-ensure root document is deleted
      try {
        await deleteDoc(doc(db, 'demos', demoId));
      } catch (e) {}

      // Cleanup Storage drafts from client
      deleteDemoFromFirebaseStorage(demoId).catch(console.warn);
    }
  }

  // 4. Purge IndexedDB drafts & snapshots (awaiting completion)
  try {
    await Promise.allSettled([
      deleteIdbDraft(demoId),
      deleteIdbSnapshotsForDemo(demoId)
    ]);
  } catch (e) {
    console.warn('IndexedDB purge notice:', e);
  }

  // 5. Purge local storage caches
  const raw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
  const map: Record<string, DemoDocument> = raw ? JSON.parse(raw) : {};
  delete map[demoId];
  localStorage.setItem(LOCAL_STORAGE_DEMOS_KEY, JSON.stringify(map));

  const stepsRaw = localStorage.getItem(LOCAL_STORAGE_STEPS_KEY);
  const stepsMap: Record<string, StepDocument[]> = stepsRaw ? JSON.parse(stepsRaw) : {};
  delete stepsMap[demoId];
  localStorage.setItem(LOCAL_STORAGE_STEPS_KEY, JSON.stringify(stepsMap));

  try {
    const cachedActive = localStorage.getItem('navigate_studio_active_demo_cache');
    if (cachedActive) {
      const parsed = JSON.parse(cachedActive);
      if (parsed?.id === demoId) {
        localStorage.removeItem('navigate_studio_active_demo_cache');
      }
    }
  } catch (e) {}

  try {
    const cachedDemos = localStorage.getItem('navigate_studio_demos_cache');
    if (cachedDemos) {
      const list: any[] = JSON.parse(cachedDemos);
      const filtered = list.filter((item) => item?.id !== demoId);
      localStorage.setItem('navigate_studio_demos_cache', JSON.stringify(filtered));
    }
  } catch (e) {}

  notifyLocalChange();
}

/**
 * Duplicate a demo — preserves all fields including tags, theme, privacy rules,
 * displayMode, and remaps intra-guide jumpToStep action IDs to the new step IDs.
 */
export async function duplicateDemo(demoId: string): Promise<DemoDocument> {
  const original = await getDemo(demoId);
  if (!original) throw new Error('Demo not found');

  const steps = await getSteps(demoId);
  const newDemo = await createDemo(
    `${original.title} (Copy)`,
    original.description,
    original.authorId,
    original.authorEmail
  );

  // Build a lookup map of old step IDs -> new step IDs for action remapping
  const stepIdMap: Record<string, string> = {};
  const newStepIds: string[] = [];

  for (const step of steps) {
    const newStepId = `step_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    stepIdMap[step.id] = newStepId;
    newStepIds.push(newStepId);
  }

  // Clone each step, remap jumpToStep action targets, and save
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const newStepId = newStepIds[i];

    const snapshot = await getDOMSnapshot(step.snapshotUrl, demoId, step.id);
    let snapshotUrl = step.snapshotUrl;
    if (snapshot) {
      snapshotUrl = await saveDOMSnapshot(newDemo.id, newStepId, snapshot);
    }

    // Remap any jumpToStep actions from old IDs to new IDs
    const remappedActions = step.actions?.map((action) => ({
      ...action,
      targetStepId:
        action.actionType === 'jumpToStep' && action.targetStepId && stepIdMap[action.targetStepId]
          ? stepIdMap[action.targetStepId]
          : action.targetStepId
    }));

    await saveStep(newDemo.id, {
      ...step,
      id: newStepId,
      stepNumber: i + 1,
      snapshotUrl,
      actions: remappedActions
    });
  }

  // Carry over all demo-level fields from the original (not just defaultStepSettings)
  const updates: Partial<DemoDocument> = {
    stepOrder: newStepIds,
    tags: original.tags ? [...original.tags] : ['Draft'],
    theme: original.theme ? JSON.parse(JSON.stringify(original.theme)) : undefined,
    coverImageUrl: original.coverImageUrl,
    displayMode: original.displayMode,
    showStepProgress: original.showStepProgress,
    allowStepJumping: original.allowStepJumping,
    globalDomModifications: original.globalDomModifications
      ? JSON.parse(JSON.stringify(original.globalDomModifications))
      : undefined
  };
  if (original.defaultStepSettings) {
    updates.defaultStepSettings = JSON.parse(JSON.stringify(original.defaultStepSettings));
  }
  await updateDemo(newDemo.id, updates);

  return { ...newDemo, ...updates };
}

/**
 * Get all steps for a demo
 */
export async function getSteps(demoId: string): Promise<StepDocument[]> {
  let steps: StepDocument[] = [];

  if (db && isFirebaseConfigured()) {
    try {
      const snapshot = await getDocs(collection(db, 'demos', demoId, 'steps'));
      steps = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as StepDocument));
    } catch (e) {
      console.warn('Firestore getSteps failed:', e);
    }
  }

  if (steps.length === 0) {
    const stepsRaw = localStorage.getItem(LOCAL_STORAGE_STEPS_KEY);
    if (stepsRaw) {
      const stepsMap: Record<string, StepDocument[]> = JSON.parse(stepsRaw);
      if (stepsMap[demoId] && stepsMap[demoId].length > 0) {
        steps = stepsMap[demoId];
      }
    }
  }

  if (steps.length === 0) {
    const idbDraft = await getIdbDraft(demoId);
    if (idbDraft?.steps && idbDraft.steps.length > 0) {
      steps = idbDraft.steps;
    }
  }

  if (steps.length === 0) return [];

  // Sort strictly according to demo.stepOrder if present
  try {
    const demo = await getDemo(demoId);
    if (demo && demo.stepOrder && demo.stepOrder.length > 0) {
      const stepMap = new Map(steps.map((s) => [s.id, s]));
      const orderedSteps: StepDocument[] = [];
      for (const id of demo.stepOrder) {
        if (stepMap.has(id)) {
          orderedSteps.push(stepMap.get(id)!);
          stepMap.delete(id);
        }
      }
      return orderedSteps.map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
    }
  } catch (e) {}

  return steps.sort((a, b) => a.stepNumber - b.stepNumber).map((s, idx) => ({ ...s, stepNumber: idx + 1 }));
}

/**
 * Save or update a step
 */
export async function saveStep(demoId: string, step: StepDocument): Promise<void> {
  // Strip undefined values using JSON stringify to prevent Firestore serialization errors
  const cleanStep = JSON.parse(JSON.stringify({
    ...step,
    updatedAt: Date.now()
  }));

  if (db && isFirebaseConfigured()) {
    try {
      const setDocPromise = setDoc(doc(db, 'demos', demoId, 'steps', step.id), cleanStep);
      const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10000));
      const res = await Promise.race([setDocPromise, timeoutPromise]);
      if (res === 'timeout') {
        console.warn('Firestore saveStep timed out after 10s. Changes are saved locally.');
      }
    } catch (e) {
      console.warn('Firestore saveStep failed:', e);
    }
  }

  const stepsRaw = localStorage.getItem(LOCAL_STORAGE_STEPS_KEY);
  const stepsMap: Record<string, StepDocument[]> = stepsRaw ? JSON.parse(stepsRaw) : {};
  const currentList = stepsMap[demoId] || [];
  const existingIdx = currentList.findIndex((s) => s.id === step.id);

  if (existingIdx >= 0) {
    currentList[existingIdx] = cleanStep;
  } else {
    currentList.push(cleanStep);
  }

  stepsMap[demoId] = currentList;
  localStorage.setItem(LOCAL_STORAGE_STEPS_KEY, JSON.stringify(stepsMap));

  // Sync stepOrder
  const demosRaw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
  const demosMap: Record<string, DemoDocument> = demosRaw ? JSON.parse(demosRaw) : {};
  if (demosMap[demoId]) {
    if (!Array.isArray(demosMap[demoId].stepOrder)) {
      demosMap[demoId].stepOrder = [];
    }
    if (!demosMap[demoId].stepOrder.includes(step.id)) {
      demosMap[demoId].stepOrder.push(step.id);
    }
    demosMap[demoId].updatedAt = Date.now();
    localStorage.setItem(LOCAL_STORAGE_DEMOS_KEY, JSON.stringify(demosMap));
  }

  notifyLocalChange();
}

/**
 * Save Demo updates and ALL Steps in a single O(1) network request using Firestore Batched Writes
 */
export async function saveDemoAndStepsBatch(
  demoId: string,
  updates: Partial<DemoDocument>,
  steps: StepDocument[]
): Promise<void> {
  const cleanUpdates = JSON.parse(JSON.stringify({ ...updates, updatedAt: Date.now() }));

  // 1. Perform a single batched network write to Firestore
  if (db && isFirebaseConfigured()) {
    try {
      const batch = writeBatch(db);
      
      // Queue demo updates
      const demoRef = doc(db, 'demos', demoId);
      batch.set(demoRef, cleanUpdates, { merge: true });

      // Queue all active step writes
      for (const step of steps) {
        const cleanStep = JSON.parse(JSON.stringify({ ...step, updatedAt: Date.now() }));
        const stepRef = doc(db, 'demos', demoId, 'steps', step.id);
        batch.set(stepRef, cleanStep);
      }

      // Add a 12-second timeout guard around batch.commit() so transient WebChannel reconnects
      // or token renegotiations never block the save flow indefinitely
      const commitPromise = batch.commit();
      const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 12000));
      const res = await Promise.race([commitPromise, timeoutPromise]);
      if (res === 'timeout') {
        console.warn('Firestore batch write timed out after 12s. Changes are saved locally and queued for cloud sync.');
      }
    } catch (e) {
      console.warn('Firestore saveDemoAndStepsBatch failed:', e);
    }
  }

  // 2. Synchronously update the local caching state
  const demoRaw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
  const demoMap: Record<string, DemoDocument> = demoRaw ? JSON.parse(demoRaw) : {};
  if (demoMap[demoId]) {
    demoMap[demoId] = { ...demoMap[demoId], ...cleanUpdates };
    localStorage.setItem(LOCAL_STORAGE_DEMOS_KEY, JSON.stringify(demoMap));
  }

  const stepsRaw = localStorage.getItem(LOCAL_STORAGE_STEPS_KEY);
  const stepsMap: Record<string, StepDocument[]> = stepsRaw ? JSON.parse(stepsRaw) : {};
  
  // Aggressively overwrite local cache to drop orphans
  stepsMap[demoId] = steps.map(step => JSON.parse(JSON.stringify({ ...step, updatedAt: Date.now() })));
  localStorage.setItem(LOCAL_STORAGE_STEPS_KEY, JSON.stringify(stepsMap));

  notifyLocalChange();
}

/**
 * Delete a step
 */
export async function deleteStep(demoId: string, stepId: string): Promise<void> {
  if (db && isFirebaseConfigured()) {
    try {
      const deletePromise = (async () => {
        await deleteDoc(doc(db, 'demos', demoId, 'steps', stepId));
        const demo = await getDemo(demoId);
        if (demo) {
          await setDoc(doc(db, 'demos', demoId), {
            stepOrder: (demo.stepOrder || []).filter((id) => id !== stepId),
            updatedAt: Date.now()
          }, { merge: true });
        }
      })();
      const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10000));
      const res = await Promise.race([deletePromise, timeoutPromise]);
      if (res === 'timeout') {
        console.warn('Firestore deleteStep timed out after 10s. Removed from local cache.');
      }
    } catch (e) {
      console.warn('Firestore deleteStep failed:', e);
    }
  }

  const stepsRaw = localStorage.getItem(LOCAL_STORAGE_STEPS_KEY);
  const stepsMap: Record<string, StepDocument[]> = stepsRaw ? JSON.parse(stepsRaw) : {};
  if (stepsMap[demoId]) {
    stepsMap[demoId] = stepsMap[demoId].filter((s) => s.id !== stepId);
    localStorage.setItem(LOCAL_STORAGE_STEPS_KEY, JSON.stringify(stepsMap));
  }

  const demosRaw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
  const demosMap: Record<string, DemoDocument> = demosRaw ? JSON.parse(demosRaw) : {};
  if (demosMap[demoId]) {
    demosMap[demoId].stepOrder = (demosMap[demoId].stepOrder || []).filter((id) => id !== stepId);
    demosMap[demoId].updatedAt = Date.now();
    localStorage.setItem(LOCAL_STORAGE_DEMOS_KEY, JSON.stringify(demosMap));
  }

  notifyLocalChange();
}

/**
 * Reorder steps
 */
export async function reorderSteps(demoId: string, newStepIds: string[]): Promise<void> {
  const steps = await getSteps(demoId);
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  const updatedSteps: StepDocument[] = [];
  newStepIds.forEach((id, index) => {
    const step = stepMap.get(id);
    if (step) {
      const updated = { ...step, stepNumber: index + 1, updatedAt: Date.now() };
      updatedSteps.push(updated);
    }
  });

  if (db && isFirebaseConfigured()) {
    try {
      await setDoc(doc(db, 'demos', demoId), {
        stepOrder: newStepIds,
        updatedAt: Date.now()
      }, { merge: true });
      for (const step of updatedSteps) {
        await setDoc(doc(db, 'demos', demoId, 'steps', step.id), step);
      }
      return;
    } catch (e) {
      console.warn('Firestore reorderSteps failed:', e);
    }
  }

  const stepsRaw = localStorage.getItem(LOCAL_STORAGE_STEPS_KEY);
  const stepsMap: Record<string, StepDocument[]> = stepsRaw ? JSON.parse(stepsRaw) : {};
  stepsMap[demoId] = updatedSteps;
  localStorage.setItem(LOCAL_STORAGE_STEPS_KEY, JSON.stringify(stepsMap));

  const demosRaw = localStorage.getItem(LOCAL_STORAGE_DEMOS_KEY);
  const demosMap: Record<string, DemoDocument> = demosRaw ? JSON.parse(demosRaw) : {};
  if (demosMap[demoId]) {
    demosMap[demoId].stepOrder = newStepIds;
    demosMap[demoId].updatedAt = Date.now();
    localStorage.setItem(LOCAL_STORAGE_DEMOS_KEY, JSON.stringify(demosMap));
  }

  notifyLocalChange();
}

/**
 * Store / fetch DOM Snapshots
 */
/**
 * Store / fetch DOM Snapshots
 */
export async function saveDOMSnapshot(demoId: string, stepId: string, snapshot: DOMSnapshot): Promise<string> {
  const localUrl = `local://snapshots/${demoId}/${stepId}`;
  // Extract a clean bare step ID from any URL format so Firestore path segments are never full URLs
  const cleanStepId = (() => {
    // Already a bare ID (no slashes or protocol)
    if (!stepId.includes('/') && !stepId.includes(':')) return stepId;
    // local://snapshots/{demoId}/{stepId} format
    const localMatch = stepId.match(/^local:\/\/snapshots\/[^/]+\/(.+?)(?:\.json)?$/);
    if (localMatch) return localMatch[1];
    // HTTP CDN URL — extract the last path segment without extension
    const filename = stepId.split('/').pop()?.replace(/\.json$/, '') || '';
    if (filename && filename.length > 0 && !filename.startsWith('http')) return filename;
    // Absolute last resort: sanitize the stepId into a valid ID
    return stepId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-80);
  })();

  // 1. Always cache in high-capacity IndexedDB immediately under all canonical keys
  const { idbKeys } = extractSnapshotCandidateKeys(localUrl, demoId, stepId);
  for (const k of idbKeys) {
    await saveIdbSnapshot(k, snapshot);
  }
  if (snapshot.id) {
    await saveIdbSnapshot(snapshot.id, snapshot);
  }

  // 2. Dual Concurrent Cloud Sync (Firestore subcollection + Firebase Storage backup)
  if (isFirebaseConfigured()) {
    const rawJson = JSON.stringify(snapshot);
    const isLargePayload = rawJson.length > 900 * 1024; // > 900 KB (Firestore max is 1MB)

    // Keys to register across cloud storage
    const cloudKeys = new Set<string>();
    if (cleanStepId) cloudKeys.add(cleanStepId);
    if (stepId && !stepId.includes('/') && !stepId.includes(':')) cloudKeys.add(stepId);
    if (snapshot.id && !snapshot.id.includes('/') && !snapshot.id.includes(':')) cloudKeys.add(snapshot.id);

    // Save to Firebase Storage as durable master file in background
    if (storage) {
      for (const k of cloudKeys) {
        uploadSnapshotToFirebaseStorage(demoId, k, snapshot).catch(() => {});
      }
    }

    // Save to Firestore subcollection for zero-CORS fast sync
    if (db) {
      try {
        for (const k of cloudKeys) {
          if (!isLargePayload) {
            await setDoc(
              doc(db, 'demos', demoId, 'snapshots', k),
              { snapshot, updatedAt: Date.now() },
              { merge: true }
            );
          } else {
            // Large payload: write metadata pointer so Incognito pulls from Storage
            await setDoc(
              doc(db, 'demos', demoId, 'snapshots', k),
              { hasFullSnapshotInStorage: true, updatedAt: Date.now() },
              { merge: true }
            );
          }
        }
      } catch (e) {
        console.warn('Firestore snapshot sync notice:', e);
      }
    }
  }

  // 4. Try secure Cloud Function presigned upload URL to R2
  const presigned = await callGetPresignedUploadUrl(demoId, stepId);
  if (presigned) {
    try {
      const uploadRes = await fetch(presigned.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(snapshot)
      });
      if (uploadRes.ok) {
        await saveIdbSnapshot(presigned.publicUrl, snapshot);
        return presigned.publicUrl;
      }
    } catch (err) {
      console.warn('Presigned upload failed, saved to IndexedDB:', err);
    }
  }

  // 5. Direct client-side R2 upload fallback (if credentials configured)
  const r2Config = getR2Config();
  if (isR2Configured()) {
    try {
      const r2Url = await uploadDOMSnapshotToR2(r2Config, demoId, stepId, snapshot);
      await saveIdbSnapshot(r2Url, snapshot);
      return r2Url;
    } catch (err) {
      console.warn('Cloudflare R2 snapshot upload failed, saved to IndexedDB:', err);
    }
  }

  return localUrl;
}

/**
 * Robustly extract all possible candidate identifiers and storage keys from any URL or ID format
 */
export function extractSnapshotCandidateKeys(
  snapshotUrl?: string,
  demoId?: string,
  stepId?: string
): { idbKeys: string[]; firestoreKeys: string[]; targetDemoId: string | null } {
  const candidateSet = new Set<string>();
  let detectedDemoId = demoId || null;

  const sanitizeString = (val?: string) => {
    if (!val || typeof val !== 'string') return;
    const trimmed = val.trim();
    if (!trimmed) return;
    candidateSet.add(trimmed);

    // 1. Strip query parameters and hash
    const withoutQuery = trimmed.split('?')[0].split('#')[0].trim();
    if (withoutQuery) candidateSet.add(withoutQuery);

    // 2. Decode URL encoding (e.g. %2F -> /)
    let decoded = withoutQuery;
    try {
      decoded = decodeURIComponent(withoutQuery);
      if (decoded) candidateSet.add(decoded);
    } catch {}

    // 3. Extract demo ID if not yet known
    if (!detectedDemoId) {
      const demoMatch = decoded.match(/(?:local:\/\/snapshots\/|drafts\/|demos\/|snap_|step_)(demo_[^/_?]+)/);
      if (demoMatch) detectedDemoId = demoMatch[1];
    }

    // 4. Extract last path segment / filename
    const lastSegment = decoded.split('/').pop() || '';
    if (lastSegment) {
      candidateSet.add(lastSegment);
      const cleanBase = lastSegment.replace(/\.json$/i, '');
      if (cleanBase) candidateSet.add(cleanBase);

      // Sibling prefix toggling: snap_ <-> step_
      if (cleanBase.startsWith('snap_')) {
        candidateSet.add(cleanBase.replace(/^snap_/, 'step_'));
      } else if (cleanBase.startsWith('step_')) {
        candidateSet.add(cleanBase.replace(/^step_/, 'snap_'));
      }
    }

    // 5. Strip local:// protocol prefix
    const withoutLocal = decoded.replace(/^local:\/\/snapshots\/[^/]+\//, '').replace(/\.json$/i, '');
    if (withoutLocal && withoutLocal !== decoded) {
      candidateSet.add(withoutLocal);
      if (withoutLocal.startsWith('snap_')) {
        candidateSet.add(withoutLocal.replace(/^snap_/, 'step_'));
      } else if (withoutLocal.startsWith('step_')) {
        candidateSet.add(withoutLocal.replace(/^step_/, 'snap_'));
      }
    }
  };

  sanitizeString(snapshotUrl);
  sanitizeString(stepId);

  // If targetDemoId is known, also add composite local:// URLs
  if (detectedDemoId) {
    const rawKeys = Array.from(candidateSet);
    for (const k of rawKeys) {
      if (k && !k.startsWith('http') && !k.startsWith('local://') && !k.includes('/')) {
        candidateSet.add(`local://snapshots/${detectedDemoId}/${k}`);
      }
    }
  }

  const allKeys = Array.from(candidateSet).filter((k): k is string => Boolean(k && k.length > 0));

  // Filter keys appropriate for Firestore doc IDs (no slashes, no protocols, <500 chars)
  const firestoreKeys = allKeys.filter(
    (k) =>
      !k.startsWith('http') &&
      !k.startsWith('local://') &&
      !k.includes('/') &&
      !k.includes('%') &&
      !k.includes('?') &&
      k.length < 500
  );

  return {
    idbKeys: allKeys,
    firestoreKeys,
    targetDemoId: detectedDemoId
  };
}

export async function getDOMSnapshot(snapshotUrl: string, demoId?: string, stepId?: string): Promise<DOMSnapshot | null> {
  if (!snapshotUrl && !stepId) {
    return null;
  }

  const { idbKeys, firestoreKeys, targetDemoId } = extractSnapshotCandidateKeys(
    snapshotUrl,
    demoId,
    stepId
  );

  // 1. Check high-capacity IndexedDB store across ALL candidate keys in a single transaction (<2ms)
  const idbSnap = await getIdbSnapshotAny(idbKeys);
  if (idbSnap) return idbSnap;

  // 1b. Fuzzy search IndexedDB snapshot store by demoId pattern if exact keys miss
  if (targetDemoId) {
    const fuzzySnap = await findMatchingIdbSnapshot([
      targetDemoId,
      ...(stepId ? [stepId] : []),
      ...firestoreKeys
    ]);
    if (fuzzySnap) {
      // Re-cache under all candidate keys for instant access next time
      for (const k of idbKeys) {
        saveIdbSnapshot(k, fuzzySnap).catch(() => {});
      }
      return fuzzySnap;
    }
  }

  // 2. Fetch from Firestore subcollection /demos/{demoId}/snapshots/{key}
  // ZERO CORS, instant cross-device and Incognito rehydration!
  if (db && isFirebaseConfigured() && targetDemoId) {
    for (const key of firestoreKeys) {
      try {
        const snapDoc = await getDoc(doc(db, 'demos', targetDemoId, 'snapshots', key));
        if (snapDoc.exists()) {
          const data = snapDoc.data();
          if (data?.snapshot) {
            const snap = data.snapshot as DOMSnapshot;
            // Cache across all candidate keys in local IndexedDB for fast subsequent renders
            for (const c of idbKeys) {
              saveIdbSnapshot(c, snap).catch(() => {});
            }
            return snap;
          }
        }
      } catch (e) {
        console.warn('Firestore snapshot getDoc notice:', e);
      }
    }
  }

  // 3. Fetch from Edge CDN / R2 if HTTP URL (for published guides)
  const effectiveUrl = snapshotUrl || '';
  if (effectiveUrl.startsWith('http') && !effectiveUrl.includes('firebasestorage.googleapis.com')) {
    try {
      const res = await fetch(effectiveUrl);
      if (res.ok) {
        const snap = (await res.json()) as DOMSnapshot;
        for (const c of idbKeys) {
          saveIdbSnapshot(c, snap).catch(() => {});
        }
        return snap;
      }
    } catch {
      // Network fallback
    }
  }

  // 4. Check legacy localStorage fallback
  const snapshotsRaw = localStorage.getItem(LOCAL_STORAGE_SNAPSHOTS_KEY);
  if (snapshotsRaw) {
    try {
      const snapshotsMap: Record<string, DOMSnapshot> = JSON.parse(snapshotsRaw);
      for (const candidate of idbKeys) {
        if (snapshotsMap[candidate]) {
          return snapshotsMap[candidate];
        }
      }
    } catch {}
  }

  // 5. Controlled fallback to Firebase Storage helper (with 404 cache)
  if (targetDemoId) {
    for (const sKey of firestoreKeys) {
      try {
        const storageSnap = await downloadSnapshotFromFirebaseStorage(targetDemoId, sKey);
        if (storageSnap) {
          for (const c of idbKeys) {
            saveIdbSnapshot(c, storageSnap).catch(() => {});
          }
          return storageSnap as DOMSnapshot;
        }
      } catch (e) {
        console.warn('Firebase Storage draft snapshot fetch notice:', e);
      }
    }
  }

  return null;
}

/**
 * Fallback: Client-side push notification to IndexNow API (Bing, Yandex, etc.)
 */
async function notifyIndexNowClient(urlList: string[]): Promise<void> {
  try {
    const payload = {
      host: APP_INDEXNOW_CONFIG.host,
      key: APP_INDEXNOW_CONFIG.key,
      keyLocation: APP_INDEXNOW_CONFIG.keyLocation,
      urlList
    };
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('IndexNow client dispatch notice:', err);
  }
}

/**
 * Publish Tour Manifest to R2 (Zero-Database Public Pipeline)
 */
export async function publishDemo(
  demoId: string,
  onProgress?: (percent: number, message: string) => void
): Promise<{ manifestUrl: string; manifest: TourManifest }> {
  onProgress?.(10, 'Loading walkthrough configuration and steps...');
  const demo = await getDemo(demoId);
  if (!demo) throw new Error('Demo not found');

  const steps = await getSteps(demoId);
  if (steps.length === 0) throw new Error('Cannot publish demo without steps');

  onProgress?.(25, 'Ordering steps and verifying navigation flows...');
  // Order steps according to demo.stepOrder
  const orderedSteps: StepDocument[] = [];
  if (demo.stepOrder && demo.stepOrder.length > 0) {
    demo.stepOrder.forEach((id) => {
      const step = steps.find((s) => s.id === id);
      if (step) orderedSteps.push(step);
    });
  } else {
    orderedSteps.push(...steps);
  }

  const stepManifests: StepManifest[] = orderedSteps.map((step, idx) => ({
    stepId: step.id,
    stepIndex: idx,
    title: step.title,
    description: step.description,
    targetSelector: step.targetSelector,
    targetCoordinates: step.targetCoordinates,
    placement: step.placement,
    triggerType: step.triggerType,
    stepType: step.stepType || 'tooltip',
    showBeacon: step.showBeacon !== false,
    showSpotlight: step.showSpotlight === true,
    focusBackdrop: step.focusBackdrop,
    targetHighlight: step.targetHighlight,
    beaconConfig: step.beaconConfig,
    buttonText: step.buttonText,
    buttonLayout: step.buttonLayout,
    showBackButton: step.showBackButton,
    backButtonText: step.backButtonText,
    textAlign: step.textAlign,
    actions: step.actions,
    inputAction: step.inputAction,
    domModifications: step.domModifications,
    autoAdvanceSeconds: step.autoAdvanceSeconds,
    audioUrl: step.audioUrl,
    themeColor: step.themeColor,
    cardStyle: step.cardStyle,
    snapshotUrl: step.snapshotUrl
  }));

  const manifest: TourManifest = {
    version: '1.0.0',
    demoId: demo.id,
    slug: demo.slug,
    title: demo.title,
    description: demo.description,
    coverImageUrl: demo.coverImageUrl,
    isFeatured: demo.isFeatured,
    totalSteps: stepManifests.length,
    theme: demo.theme,
    displayMode: demo.displayMode || 'standard',
    showStepProgress: demo.showStepProgress ?? true,
    allowStepJumping: demo.allowStepJumping ?? true,
    globalDomModifications: demo.globalDomModifications,
    defaultStepSettings: demo.defaultStepSettings,
    publishedAt: new Date().toISOString(),
    steps: stepManifests
  };

  // Collect all step DOM snapshots (which contain stripped-down HTML, inlined images, & styles)
  const snapshots: Record<string, DOMSnapshot> = {};
  for (let i = 0; i < orderedSteps.length; i++) {
    const step = orderedSteps[i];
    const progressPercent = 30 + Math.round(((i + 1) / orderedSteps.length) * 30);
    onProgress?.(progressPercent, `Packaging DOM snapshot ${i + 1} of ${orderedSteps.length}...`);
    if (step.snapshotUrl) {
      const snap = await getDOMSnapshot(step.snapshotUrl, demoId, step.id);
      if (snap) {
        snapshots[step.id] = snap;
      }
    }
  }

  let manifestUrl = '';

  onProgress?.(65, 'Deploying static bundles and snapshots to Cloudflare R2 Edge CDN...');
  // 1. Try secure Firebase Cloud Function server-side publish (uploads snapshots, manifest & edge catalog)
  const fnRes = await callPublishTourManifest(demoId, manifest, snapshots);
  if (fnRes && fnRes.manifestUrl) {
    manifestUrl = fnRes.manifestUrl;
  } else if (isR2Configured()) {
    // 2. Direct client-side R2 upload fallback
    const r2Config = getR2Config();
    const cleanPublicUrl = r2Config.publicUrl.replace(/\/$/, '');
    try {
      // Upload each snapshot to R2
      for (const [stepId, snapObj] of Object.entries(snapshots)) {
        await uploadDOMSnapshotToR2(r2Config, demoId, stepId, snapObj);
      }
      for (const step of stepManifests) {
        step.snapshotUrl = `${cleanPublicUrl}/demos/${demoId}/snapshots/${step.stepId}.json`;
      }
      manifestUrl = await uploadManifestToR2(r2Config, demoId, manifest);
    } catch (err) {
      console.warn('R2 manifest upload failed, using local published route:', err);
    }
  }

  onProgress?.(90, 'Updating Edge directory catalog & locking published state...');

  const vanityPath = demo.slug || demoId;
  if (!manifestUrl) {
    manifestUrl = `${window.location.origin}/view/${vanityPath}`;
  }

  // Update demo document in Firestore/LocalStorage
  await updateDemo(demoId, {
    isPublished: true,
    publishedManifestUrl: manifestUrl
  });

  // Store compiled manifest in local store for instantaneous zero-latency preview
  localStorage.setItem(`manifest_${demoId}`, JSON.stringify(manifest));
  if (demo.slug) {
    localStorage.setItem(`manifest_${demo.slug}`, JSON.stringify(manifest));
  }

  // If Cloud Function did not handle it (client-side upload fallback), push to IndexNow directly
  if (!fnRes?.manifestUrl) {
    notifyIndexNowClient([
      `https://navigate.rsamdio.org/view/${vanityPath}`,
      'https://navigate.rsamdio.org/'
    ]);
  }

  return { manifestUrl, manifest };
}

/**
 * Load static Edge Catalog for Zero-Database Public Portal Landing Page
 */
export async function loadPublicCatalog(): Promise<DemoDocument[]> {
  const r2Config = getR2Config();
  if (r2Config.publicUrl) {
    const catalogUrl = `${r2Config.publicUrl.replace(/\/$/, '')}/demos/catalog.json`;
    try {
      const res = await fetch(catalogUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          return data.map((item: any) => ({
            id: item.id || item.demoId,
            slug: item.slug,
            title: item.title || 'Interactive Guide',
            description: item.description || '',
            coverImageUrl: item.coverImageUrl,
            isFeatured: item.isFeatured,
            tags: item.tags || [],
            stepOrder: item.stepOrder || [],
            createdAt: item.createdAt || Date.now(),
            updatedAt: item.updatedAt || Date.now(),
            isPublished: true,
            publishedManifestUrl: item.publishedManifestUrl || item.manifestUrl
          } as DemoDocument));
        }
      }
    } catch (e) {
      console.warn('Edge catalog fetch notice:', e);
    }
  }

  return [];
}

/**
 * Load static TourManifest for Zero-Database Public Player
 */
export async function loadPublicTourManifest(demoIdOrSlug: string, isPreview = false): Promise<TourManifest> {
  // 1. Try local cached manifest (bypass if preview)
  if (!isPreview) {
    const localCached = localStorage.getItem(`manifest_${demoIdOrSlug}`);
    if (localCached) {
      try {
        return JSON.parse(localCached);
      } catch {
        // Fallback
      }
    }
  }

  // 2. Try R2 Direct ID URL (bypass if preview)
  const r2Config = getR2Config();
  if (!isPreview && r2Config.publicUrl) {
    const cleanPublicUrl = r2Config.publicUrl.replace(/\/$/, '');
    const r2ManifestUrl = `${cleanPublicUrl}/demos/${demoIdOrSlug}/manifest.json`;
    try {
      const res = await fetch(r2ManifestUrl);
      if (res.ok) {
        return (await res.json()) as TourManifest;
      }
    } catch {
      // Fallback
    }

    // 3. If accessing by custom slug, resolve against edge catalog.json
    try {
      const catalog = await loadPublicCatalog();
      const match = catalog.find((c) => c.slug === demoIdOrSlug || c.id === demoIdOrSlug);
      if (match) {
        const slugManifestUrl = `${cleanPublicUrl}/demos/${match.id}/manifest.json`;
        const res = await fetch(slugManifestUrl);
        if (res.ok) {
          return (await res.json()) as TourManifest;
        }
      }
    } catch {
      // Fallback
    }
  }

  // 4. Fallback to constructing manifest from local/Firestore store
  const demo = await getDemo(demoIdOrSlug);
  if (!demo) throw new Error(`Walkthrough "${demoIdOrSlug}" not found`);

  const steps = await getSteps(demo.id);
  const orderedSteps: StepDocument[] = [];
  if (demo.stepOrder && demo.stepOrder.length > 0) {
    demo.stepOrder.forEach((id) => {
      const step = steps.find((s) => s.id === id);
      if (step) orderedSteps.push(step);
    });
  } else {
    orderedSteps.push(...steps);
  }

  return {
    version: '1.0.0',
    demoId: demo.id,
    slug: demo.slug,
    title: demo.title,
    description: demo.description,
    coverImageUrl: demo.coverImageUrl,
    isFeatured: demo.isFeatured,
    totalSteps: orderedSteps.length,
    theme: demo.theme,
    displayMode: demo.displayMode || 'standard',
    showStepProgress: demo.showStepProgress ?? true,
    allowStepJumping: demo.allowStepJumping ?? true,
    globalDomModifications: demo.globalDomModifications,
    defaultStepSettings: demo.defaultStepSettings,
    publishedAt: new Date().toISOString(),
    steps: orderedSteps.map((s, idx) => ({
      stepId: s.id,
      stepIndex: idx,
      title: s.title,
      description: s.description,
      targetSelector: s.targetSelector,
      targetCoordinates: s.targetCoordinates,
      placement: s.placement,
      triggerType: s.triggerType,
      stepType: s.stepType || 'tooltip',
      showBeacon: s.showBeacon !== false,
      showSpotlight: s.showSpotlight === true,
      focusBackdrop: s.focusBackdrop,
      targetHighlight: s.targetHighlight,
      beaconConfig: s.beaconConfig,
      buttonText: s.buttonText,
      buttonLayout: s.buttonLayout,
      showBackButton: s.showBackButton,
      backButtonText: s.backButtonText,
      textAlign: s.textAlign,
      actions: s.actions,
      inputAction: s.inputAction,
      domModifications: s.domModifications,
      autoAdvanceSeconds: s.autoAdvanceSeconds,
      audioUrl: s.audioUrl,
      themeColor: s.themeColor,
      cardStyle: s.cardStyle,
      snapshotUrl: s.snapshotUrl
    }))
  };
}

/**
 * Unpublish a Demo (Revert to Draft status)
 */
export async function unpublishDemo(demoId: string): Promise<void> {
  // 1. Invoke Cloud Function to remove manifest from R2 and re-sync catalog
  const fnRes = await callUnpublishTourManifest(demoId);
  if (!fnRes?.success) {
    // Cloud Function unavailable or R2 not configured — fall back to local-only mark
    console.warn('unpublishTourManifest Cloud Function unavailable, updating Firestore only.');
    await updateDemo(demoId, { isPublished: false, publishedManifestUrl: undefined });
    notifyIndexNowClient([
      `https://navigate.rsamdio.org/view/${demoId}`,
      'https://navigate.rsamdio.org/'
    ]);
  }

  // 2. Purge both ID-keyed and slug-keyed local manifest caches
  try {
    localStorage.removeItem(`manifest_${demoId}`);
    // Also purge slug-keyed cache if slug is known
    const demo = await getDemo(demoId);
    if (demo?.slug) {
      localStorage.removeItem(`manifest_${demo.slug}`);
    }
  } catch {}
}

export const createDefaultBlankSnapshot = (stepId: string, title?: string, desc?: string): DOMSnapshot => ({
  id: `snap_${Date.now()}`,
  stepId,
  url: 'https://navigate.rotaractsouthasia.org',
  title: title || 'Interactive Guide Canvas',
  capturedAt: Date.now(),
  viewport: { width: 1280, height: 800, scrollX: 0, scrollY: 0 },
  styles: [
    `body { margin: 0; font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; color: #0f172a; }
    .canvas-card { text-align: center; padding: 48px 32px; border: 2px dashed #cbd5e1; border-radius: 24px; max-width: 520px; background: white; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .canvas-title { font-size: 20px; font-weight: 800; color: #0c3c60; margin: 0 0 8px 0; }
    .canvas-desc { font-size: 13px; color: #64748b; margin: 0; line-height: 1.5; }`
  ],
  html: `<!DOCTYPE html><html><head><title>Canvas</title></head><body><div id="starter-canvas-target" class="canvas-card"><h2 class="canvas-title">${title || 'Interactive Guide Canvas'}</h2><p class="canvas-desc">${desc || 'Click anywhere to target an element, or use the NAVIGATE Chrome Extension to record live website workflows.'}</p></div></body></html>`
});
