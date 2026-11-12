/** Shared document delivery and comment capabilities for creation and repair. */
export const DOCUMENT_SCOPES = Object.freeze([
  'docx:document:create', 'docx:document:readonly', 'docx:document:write_only',
  'docx:document.block:convert', 'docs:document.comment:read', 'docs:document.comment:create',
  'docs:permission.member:create', 'drive:drive.metadata:readonly',
]);
export const DOCUMENT_COMMENT_EVENT = 'drive.notice.comment_add_v1';
