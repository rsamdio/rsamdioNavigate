import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

initializeApp();
const db = getFirestore();

// Helper to create Cloudflare R2 S3 Client using server-side environment secrets
function getR2Client(): { client: S3Client; bucketName: string; publicUrl: string } {
  const accountId = process.env.R2_ACCOUNT_ID || '';
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
  const bucketName = process.env.R2_BUCKET_NAME || 'interactive-demos';
  const publicUrl = process.env.R2_PUBLIC_URL || 'https://pub-tour.r2.dev';

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new HttpsError(
      'failed-precondition',
      'Cloudflare R2 credentials are not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in packages/functions/.env'
    );
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });

  return { client, bucketName, publicUrl };
}

// Helper to verify user is authenticated and authorized via Firestore /users/{uid} document
interface AuthResult {
  uid: string;
  email: string;
  isSuperAdmin: boolean;
  role: 'super_admin' | 'creator';
}

async function verifyAuthorizedCreator(auth: { uid: string; token: { email?: string } } | undefined): Promise<AuthResult> {
  if (!auth) {
    throw new HttpsError(
      'unauthenticated',
      'You must be signed in to perform this operation.'
    );
  }

  const uid = auth.uid;
  const email = (auth.token.email || '').toLowerCase();

  // 1. Query Firestore /users/{uid} document for role
  const userDocRef = db.collection('users').doc(uid);
  let userDoc = await userDocRef.get();

  if (userDoc.exists) {
    const userData = userDoc.data();
    const role = userData?.role;

    if (role === 'super_admin') {
      return { uid, email, isSuperAdmin: true, role: 'super_admin' };
    }

    if (role === 'creator') {
      return { uid, email, isSuperAdmin: false, role: 'creator' };
    }

    throw new HttpsError(
      'permission-denied',
      'Access Denied: You do not have permission to access the NAVIGATE Studio. Please contact the Super Admin.'
    );
  }

  // 2. Check if pre-provisioned by email in /users collection
  if (email) {
    const emailQuery = await db.collection('users').where('email', '==', email).limit(1).get();
    if (!emailQuery.empty) {
      const preDoc = emailQuery.docs[0];
      const preData = preDoc.data();
      const role = preData?.role === 'super_admin' ? 'super_admin' : 'creator';

      // Link real UID to user doc
      await userDocRef.set({
        uid,
        email,
        displayName: preData.displayName || email.split('@')[0],
        role,
        createdAt: preData.createdAt || Date.now(),
        updatedAt: Date.now()
      }, { merge: true });

      // Clean up placeholder doc if ID was different
      if (preDoc.id !== uid) {
        await preDoc.ref.delete().catch(() => {});
      }

      return { uid, email, isSuperAdmin: role === 'super_admin', role };
    }
  }

  // 3. First-user self-bootstrapping: If the /users collection is completely empty,
  // the first user to authenticate automatically becomes the initial Super Admin.
  const usersSnapshot = await db.collection('users').limit(1).get();
  if (usersSnapshot.empty) {
    await userDocRef.set({
      uid,
      email,
      role: 'super_admin',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    return { uid, email, isSuperAdmin: true, role: 'super_admin' };
  }

  // 4. Do NOT create pending user documents. Deny access immediately.
  throw new HttpsError(
    'permission-denied',
    'Access Denied: You do not have permission to access the NAVIGATE Studio. Please contact the Super Admin.'
  );
}

/**
 * Callable Function: getPresignedUploadUrl
 * Generates a secure, temporary S3/R2 presigned PUT URL for uploading DOM snapshots.
 * Zero secrets are exposed to the client browser.
 */
export const getPresignedUploadUrl = onCall(async (request) => {
  await verifyAuthorizedCreator(request.auth);

  const { demoId, stepId, contentType = 'application/json' } = request.data;

  if (!demoId || !stepId) {
    throw new HttpsError('invalid-argument', 'Missing demoId or stepId.');
  }

  const { client, bucketName, publicUrl } = getR2Client();
  const isCover = stepId === 'cover' || contentType.startsWith('image/');
  const key = isCover ? `demos/${demoId}/cover.webp` : `demos/${demoId}/snapshots/${stepId}.json`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable'
  });

  // Generate 15-minute presigned upload URL
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 900 });
  const finalPublicUrl = `${publicUrl.replace(/\/$/, '')}/${key}`;

  return {
    uploadUrl,
    publicUrl: finalPublicUrl,
    key
  };
});

/**
 * Helper: Sync all published walkthroughs into static Edge catalog.json on Cloudflare R2
 */
async function syncCatalogToR2(client: any, bucketName: string, publicUrl: string) {
  try {
    const publishedDocs = await db.collection('demos').where('isPublished', '==', true).get();
    const catalogEntries = publishedDocs.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        slug: data.slug || d.id,
        title: data.title || 'Interactive Guide',
        description: data.description || '',
        coverImageUrl: data.coverImageUrl || '',
        isFeatured: data.isFeatured || false,
        tags: data.tags || [],
        stepOrder: data.stepOrder || [],
        createdAt: data.createdAt || Date.now(),
        updatedAt: data.updatedAt || Date.now(),
        isPublished: true,
        publishedManifestUrl: data.publishedManifestUrl || `${publicUrl}/demos/${d.id}/manifest.json`
      };
    });

    await client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: 'demos/catalog.json',
        Body: JSON.stringify(catalogEntries, null, 2),
        ContentType: 'application/json',
        CacheControl: 'public, max-age=60, s-maxage=300'
      })
    );
  } catch (err) {
    console.warn('Failed to sync catalog.json to R2 Edge CDN:', err);
  }
}

/**
 * Helper: Notify IndexNow API of newly published, updated, or unpublished guide URLs
 */
async function notifyIndexNow(urlList: string[]) {
  try {
    const key = process.env.INDEXNOW_KEY || 'e4b54e7e62a343df89961d1ea009e530';
    const host = 'navigate.rsamdio.org';
    const payload = {
      host,
      key,
      keyLocation: `https://${host}/${key}.txt`,
      urlList
    };

    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });

    console.log(`[notifyIndexNow] Dispatched ${urlList.length} URL(s) to IndexNow (HTTP ${res.status})`);
  } catch (err) {
    console.warn('[notifyIndexNow] Notice: IndexNow notification failed (non-blocking):', err);
  }
}

/**
 * Callable Function: publishTourManifest
 * Compiles and directly publishes manifest.json, step HTML snapshots, and edge catalog.json to Cloudflare R2.
 */
export const publishTourManifest = onCall(async (request) => {
  await verifyAuthorizedCreator(request.auth);

  const { demoId, manifest, snapshots = {} } = request.data;

  if (!demoId || !manifest) {
    throw new HttpsError('invalid-argument', 'Missing demoId or manifest payload.');
  }

  const { client, bucketName, publicUrl } = getR2Client();
  const cleanPublicUrl = publicUrl.replace(/\/$/, '');

  // 1. Upload all provided step DOM snapshots to R2
  const snapshotEntries = Object.entries(snapshots as Record<string, any>);
  for (const [stepId, snapObj] of snapshotEntries) {
    if (snapObj) {
      const snapKey = `demos/${demoId}/snapshots/${stepId}.json`;
      await client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: snapKey,
          Body: JSON.stringify(snapObj),
          ContentType: 'application/json',
          CacheControl: 'public, max-age=31536000, immutable'
        })
      );
    }
  }

  // 1.5 Fallback check: if any step in manifest was not in snapshots map, retrieve from Firestore/Storage
  if (manifest.steps && Array.isArray(manifest.steps)) {
    for (const step of manifest.steps) {
      const stepId = step.stepId || step.id;
      if (stepId && !snapshots[stepId]) {
        try {
          const docSnap = await db.collection('demos').doc(demoId).collection('snapshots').doc(stepId).get();
          let snapData = docSnap.data()?.snapshot;
          if (!snapData) {
            const bucket = getStorage().bucket();
            const file = bucket.file(`drafts/${demoId}/snapshots/${stepId}.json`);
            const [exists] = await file.exists();
            if (exists) {
              const [contents] = await file.download();
              snapData = JSON.parse(contents.toString('utf-8'));
            }
          }
          if (snapData) {
            await client.send(
              new PutObjectCommand({
                Bucket: bucketName,
                Key: `demos/${demoId}/snapshots/${stepId}.json`,
                Body: JSON.stringify(snapData),
                ContentType: 'application/json',
                CacheControl: 'public, max-age=31536000, immutable'
              })
            );
          }
        } catch (err) {
          console.warn(`Fallback R2 snapshot sync notice for step ${stepId}:`, err);
        }
      }
    }
  }

  // 2. Ensure each step manifest points to its absolute R2 snapshot URL
  if (manifest.steps && Array.isArray(manifest.steps)) {
    for (const step of manifest.steps) {
      const stepId = step.stepId || step.id;
      if (stepId) {
        step.snapshotUrl = `${cleanPublicUrl}/demos/${demoId}/snapshots/${stepId}.json`;
      }
    }
  }

  // 3. Upload compiled manifest.json to R2
  const key = `demos/${demoId}/manifest.json`;
  const body = JSON.stringify(manifest, null, 2);

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: 'application/json',
    CacheControl: 'public, max-age=300, s-maxage=3600'
  });

  await client.send(command);

  const finalPublicManifestUrl = `${cleanPublicUrl}/${key}`;

  // 4. Update Firestore demo status
  await db.collection('demos').doc(demoId).set(
    {
      isPublished: true,
      publishedManifestUrl: finalPublicManifestUrl,
      updatedAt: Date.now()
    },
    { merge: true }
  );

  // 5. Update static edge catalog on R2
  await syncCatalogToR2(client, bucketName, cleanPublicUrl);

  // 6. Push real-time update to IndexNow search engines (Bing, Yandex, etc.)
  const guideSlug = (manifest as any).slug || demoId;
  await notifyIndexNow([
    `https://navigate.rsamdio.org/view/${guideSlug}`,
    'https://navigate.rsamdio.org/'
  ]);

  return {
    success: true,
    manifestUrl: finalPublicManifestUrl
  };
});

/**
 * Callable Function: setUserRole (Super Admin only)
 * Updates user role in Firestore /users/{targetUid}
 */
export const setUserRole = onCall(async (request) => {
  const caller = await verifyAuthorizedCreator(request.auth);

  if (!caller.isSuperAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only Super Administrators can manage user permissions.'
    );
  }

  const { targetUid, role, email, displayName } = request.data;

  if (!targetUid || !['super_admin', 'creator'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Invalid targetUid or role (must be super_admin or creator).');
  }

  // Super admin protection: Super admin cannot demote themselves
  if (targetUid === caller.uid && role !== 'super_admin') {
    throw new HttpsError(
      'permission-denied',
      'Super Administrators cannot demote their own account.'
    );
  }

  // Super admin protection: Existing super admins cannot be demoted
  const targetDoc = await db.collection('users').doc(targetUid).get();
  if (targetDoc.exists && targetDoc.data()?.role === 'super_admin' && role !== 'super_admin') {
    throw new HttpsError(
      'permission-denied',
      'Super Administrator accounts cannot be demoted.'
    );
  }

  await db.collection('users').doc(targetUid).set(
    {
      uid: targetUid,
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(displayName ? { displayName } : {}),
      role,
      updatedAt: Date.now()
    },
    { merge: true }
  );

  return { success: true };
});

/**
 * Callable Function: deleteUser (Super Admin only)
 * Deletes user document from Firestore /users/{targetUid}
 */
export const deleteUser = onCall(async (request) => {
  const caller = await verifyAuthorizedCreator(request.auth);

  if (!caller.isSuperAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only Super Administrators can delete users.'
    );
  }

  const { targetUid } = request.data;

  if (!targetUid) {
    throw new HttpsError('invalid-argument', 'Missing targetUid.');
  }

  // Super admin protection: Cannot delete self
  if (targetUid === caller.uid) {
    throw new HttpsError(
      'permission-denied',
      'Super Administrators cannot delete their own account.'
    );
  }

  // Super admin protection: Cannot delete other super admins
  const targetDoc = await db.collection('users').doc(targetUid).get();
  if (targetDoc.exists && targetDoc.data()?.role === 'super_admin') {
    throw new HttpsError(
      'permission-denied',
      'Super Administrator accounts cannot be deleted.'
    );
  }

  await db.collection('users').doc(targetUid).delete();

  return { success: true };
});

/**
 * Callable Function: listUsers (Super Admin only)
 * Returns all user documents from Firestore /users
 */
export const listUsers = onCall(async (request) => {
  const caller = await verifyAuthorizedCreator(request.auth);

  if (!caller.isSuperAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only Super Administrators can view user list.'
    );
  }

  const snapshot = await db.collection('users').get();
  const users = snapshot.docs.map((d) => ({
    uid: d.id,
    ...d.data()
  }));

  return { users };
});

/**
 * Callable Function: getDraftSnapshot
 * Fetches a draft DOM snapshot server-side with zero CORS restrictions.
 */
export const getDraftSnapshot = onCall(async (request) => {
  await verifyAuthorizedCreator(request.auth);
  const { demoId, stepId } = request.data || {};
  if (!demoId || !stepId) {
    throw new HttpsError('invalid-argument', 'Missing demoId or stepId.');
  }

  const cleanStepId = stepId.replace(/^local:\/\/snapshots\/[^/]+\//, '').replace(/\.json$/, '');

  try {
    const bucket = getStorage().bucket();
    const file = bucket.file(`drafts/${demoId}/snapshots/${cleanStepId}.json`);
    const [exists] = await file.exists();
    if (exists) {
      const [contents] = await file.download();
      return JSON.parse(contents.toString('utf-8'));
    }
  } catch (err) {
    console.warn('Storage snapshot download error in Cloud Function:', err);
  }

  return null;
});

/**
 * Callable Function: deleteTourAssets
 * Securely completely wipes a guide from all server-side infrastructure:
 * Cloudflare R2 edge (manifest + ALL snapshots), Firebase Storage, Firestore subcollections,
 * and re-syncs the public edge catalog.json.
 */
export const deleteTourAssets = onCall(async (request) => {
  await verifyAuthorizedCreator(request.auth);
  const { demoId } = request.data || {};
  if (!demoId) {
    throw new HttpsError('invalid-argument', 'Missing demoId.');
  }

  console.log(`[deleteTourAssets] Initiating full deletion for demo: ${demoId}`);

  let r2Client: S3Client | null = null;
  let r2BucketName = '';
  let r2PublicUrl = '';

  // 1. Bulk-delete ALL R2 objects under demos/${demoId}/ (manifest + every snapshot)
  try {
    const { client, bucketName, publicUrl } = getR2Client();
    r2Client = client;
    r2BucketName = bucketName;
    r2PublicUrl = publicUrl;

    // List all objects under this demo's prefix
    let continuationToken: string | undefined;
    const keysToDelete: { Key: string }[] = [];

    do {
      const listCmd = new ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: `demos/${demoId}/`,
        ContinuationToken: continuationToken
      });
      const listRes = await client.send(listCmd);
      if (listRes.Contents) {
        listRes.Contents.forEach((obj) => {
          if (obj.Key) keysToDelete.push({ Key: obj.Key });
        });
      }
      continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
    } while (continuationToken);

    if (keysToDelete.length > 0) {
      // S3/R2 DeleteObjects supports up to 1000 keys per request
      const CHUNK_SIZE = 1000;
      for (let i = 0; i < keysToDelete.length; i += CHUNK_SIZE) {
        const chunk = keysToDelete.slice(i, i + CHUNK_SIZE);
        await client.send(new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: { Objects: chunk, Quiet: true }
        }));
      }
      console.log(`[deleteTourAssets] Deleted ${keysToDelete.length} R2 objects for ${demoId}`);
    } else {
      console.log(`[deleteTourAssets] No R2 objects found for ${demoId} (may not have been published).`);
    }
  } catch (err) {
    console.warn(`[deleteTourAssets] R2 deletion failed for ${demoId}:`, err);
    // Non-fatal: continue with Firestore/Storage cleanup even if R2 fails
  }

  // 2. Delete all draft snapshots from Firebase Storage
  try {
    const bucket = getStorage().bucket();
    await bucket.deleteFiles({ prefix: `drafts/${demoId}/` });
    console.log(`[deleteTourAssets] Firebase Storage drafts deleted for ${demoId}`);
  } catch (err) {
    console.warn(`[deleteTourAssets] Storage deletion failed for ${demoId}:`, err);
  }

  // 3. Delete orphaned Firestore subcollections and root document
  try {
    const demoRef = db.collection('demos').doc(demoId);

    // Batch delete 'steps' subcollection
    const stepsSnapshot = await demoRef.collection('steps').get();
    if (!stepsSnapshot.empty) {
      const batchSteps = db.batch();
      stepsSnapshot.docs.forEach(doc => batchSteps.delete(doc.ref));
      await batchSteps.commit();
      console.log(`[deleteTourAssets] Deleted ${stepsSnapshot.size} steps for ${demoId}`);
    }

    // Batch delete 'snapshots' subcollection
    const snapsSnapshot = await demoRef.collection('snapshots').get();
    if (!snapsSnapshot.empty) {
      const batchSnaps = db.batch();
      snapsSnapshot.docs.forEach(doc => batchSnaps.delete(doc.ref));
      await batchSnaps.commit();
      console.log(`[deleteTourAssets] Deleted ${snapsSnapshot.size} snapshots for ${demoId}`);
    }

    // Finally delete the root demo document
    await demoRef.delete();
    console.log(`[deleteTourAssets] Root demo document deleted for ${demoId}`);
  } catch (err) {
    console.error(`[deleteTourAssets] Firestore deletion failed for ${demoId}:`, err);
    throw new HttpsError('internal', 'Failed to completely wipe tour assets from database.');
  }

  // 4. Re-sync public edge catalog.json so the guide disappears from the public portal
  if (r2Client) {
    await syncCatalogToR2(r2Client, r2BucketName, r2PublicUrl);
    console.log(`[deleteTourAssets] Edge catalog.json re-synced after deletion of ${demoId}`);
  }

  return { success: true };
});

/**
 * Callable Function: unpublishTourManifest
 * Removes a guide's manifest.json from Cloudflare R2 CDN, marks it as unpublished
 * in Firestore, and re-syncs the public edge catalog.json.
 * The Firestore document is preserved (guide remains a draft in Studio).
 */
export const unpublishTourManifest = onCall(async (request) => {
  await verifyAuthorizedCreator(request.auth);
  const { demoId } = request.data || {};
  if (!demoId) {
    throw new HttpsError('invalid-argument', 'Missing demoId.');
  }

  console.log(`[unpublishTourManifest] Unpublishing demo: ${demoId}`);

  // 1. Delete manifest.json from Cloudflare R2
  try {
    const { client, bucketName, publicUrl } = getR2Client();

    await client.send(new DeleteObjectCommand({
      Bucket: bucketName,
      Key: `demos/${demoId}/manifest.json`
    }));
    console.log(`[unpublishTourManifest] R2 manifest deleted for ${demoId}`);

    // 2. Update Firestore: mark as unpublished, clear manifest URL
    await db.collection('demos').doc(demoId).set(
      {
        isPublished: false,
        publishedManifestUrl: null,
        updatedAt: Date.now()
      },
      { merge: true }
    );
    console.log(`[unpublishTourManifest] Firestore updated for ${demoId}`);

    // 3. Re-sync edge catalog.json (guide should no longer appear on public portal)
    await syncCatalogToR2(client, bucketName, publicUrl);
    console.log(`[unpublishTourManifest] Edge catalog.json re-synced after unpublish of ${demoId}`);
  } catch (err) {
    // If R2 is not configured or deletion fails, still mark as unpublished in Firestore
    console.warn(`[unpublishTourManifest] R2 operation failed for ${demoId}:`, err);
    try {
      await db.collection('demos').doc(demoId).set(
        { isPublished: false, publishedManifestUrl: null, updatedAt: Date.now() },
        { merge: true }
      );
    } catch (fsErr) {
      console.error(`[unpublishTourManifest] Firestore fallback also failed:`, fsErr);
      throw new HttpsError('internal', 'Failed to unpublish tour.');
    }
  }

  // 4. Push update to IndexNow search engines so stale guide URLs are de-indexed/updated
  await notifyIndexNow([
    `https://navigate.rsamdio.org/view/${demoId}`,
    'https://navigate.rsamdio.org/'
  ]);

  return { success: true };
});
