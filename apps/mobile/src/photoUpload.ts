export async function resolveUpload<UploadId, Provider>(
  ticket: UploadId | undefined,
  reserve: () => Promise<UploadId>,
  check: (ticket: UploadId) => Promise<Provider>,
): Promise<{ ticket: UploadId; provider: Provider }> {
  const existing = ticket ?? (await reserve());
  try {
    return { ticket: existing, provider: await check(existing) };
  } catch (error) {
    // Only a definitive server-side expiry permits replacing a ticket. An uncertain
    // response or network error must keep its identity for idempotent reconciliation.
    const expired =
      error &&
      typeof error === 'object' &&
      'data' in error &&
      error.data === 'Upload expired. Please retry.';
    if (!expired) throw error;
    const replacement = await reserve();
    return { ticket: replacement, provider: await check(replacement) };
  }
}

export function uploadError(status: number) {
  if (status === 401) return 'Sign in again to upload images.';
  if (status === 403) return 'You no longer have permission to upload to this visit.';
  if (status === 410) return 'This upload expired. Retry to start a new upload.';
  if (status === 413) return 'Choose an image smaller than 10 MB.';
  if (status === 415) return 'Choose a JPEG, PNG, or WebP image.';
  return 'Image storage is temporarily unavailable. Please retry.';
}
