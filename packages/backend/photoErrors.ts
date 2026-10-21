export function photoFailure(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/sign in/i.test(message))
    return { status: 401, code: 'SIGN_IN_REQUIRED', message: 'Sign in again to upload photos.' };
  if (/Use the local photo service|Use Convex for/i.test(message))
    return {
      status: 403,
      code: 'WRONG_PROVIDER',
      message: 'Retry this upload using its original storage destination.',
    };
  if (/expired/i.test(message))
    return {
      status: 410,
      code: 'UPLOAD_EXPIRED',
      message: 'The upload expired. Choose the photo again.',
    };
  if (/access|another person|not authorized|unavailable or|no longer available/i.test(message))
    return {
      status: 403,
      code: 'ACCESS_DENIED',
      message: 'You no longer have access to this photo or visit.',
    };
  if (/10 photos|up to 10|valid JPEG|10 MB|Use JPEG|already has/i.test(message))
    return {
      status: 422,
      code: 'INVALID_PHOTO',
      message: 'Use a supported image up to 10 MB and no more than 10 photos per visit.',
    };
  return {
    status: 503,
    code: 'PHOTO_SERVICE_UNAVAILABLE',
    message: 'Photos are temporarily unavailable. Please retry.',
  };
}
