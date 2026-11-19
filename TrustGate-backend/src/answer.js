// Replace this function when the AI teammate's provider integration is ready.
// The server calls it only after authorization and passes just one record.
export async function generateAnswer({ record }) {
  return record.content;
}
