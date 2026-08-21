export type UploadErrorCode =
  | 'FILE_TOO_LARGE'          // file exceeds the per-type size limit — rejected before XHR starts
  | 'CLOUDINARY_REJECTED'     // 4xx response — invalid params or policy rejection
  | 'CLOUDINARY_UNAVAILABLE'  // 5xx response — Cloudinary service error
  | 'NETWORK_ERROR'           // XHR onerror — no response received
  | 'INVALID_RESPONSE';       // 2xx but response body is not valid JSON, or eager missing

export class UploadError extends Error {
  readonly code: UploadErrorCode;

  constructor(code: UploadErrorCode, message: string) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
  }
}
