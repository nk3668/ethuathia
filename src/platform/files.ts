/**
 * Local file helpers for exporting and importing saves. Both stay on the player's machine: the
 * download is made from an in-memory blob and the upload is read from a file the player picks.
 */

/** Offers `text` to the player as a file download named `filename`. */
export function downloadTextFile(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Reads a file the player picked as text. */
export function readTextFile(file: Blob): Promise<string> {
  return file.text();
}
