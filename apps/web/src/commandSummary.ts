/** Summarize a shell invocation without hiding the work behind its executable path.
 * Display only: never parse this result to execute a command. */
export function commandSummary(command: string): string {
  let text = command.trim();
  const wrapper = text.match(/^(?:&\s*)?(?:"[^"]*[\\/](?:powershell|pwsh|cmd)(?:\.exe)?"|'[^']*[\\/](?:powershell|pwsh|cmd)(?:\.exe)?'|(?:[^\s"']*[\\/])?(?:powershell|pwsh|cmd)(?:\.exe)?)\s+(?:-(?:NoProfile|NonInteractive|NoLogo)\s+)*(?:-Command\s+|\/d\s+\/s\s+\/c\s+|\/c\s+)([\s\S]+)$/i);
  if (wrapper) {
    text = wrapper[1].trim();
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) text = text.slice(1, -1);
  }
  // Keep arguments and their order; only shorten an absolute executable path.
  text = text.replace(/^(?:"([^"\r\n]+[\\/])([^"\\/]+)"|([A-Za-z]:[\\/]|\/)([^\s]*[\\/])?([^\s\\/]+))(?=\s|$)/,
    (_all, _quotedDir, quotedName, _root, _dir, name) => quotedName ?? name);
  return text.replace(/\s+/g, ' ').trim();
}
