type Draft = {
  notes: string;
  coverLetter: string;
};
let owner: number | null = null;
const drafts = new Map<number, Draft>();
function scope(account: number | null) {
  if (owner !== account) {
    drafts.clear();
    owner = account;
  }
}
export function readDraft(account: number | null, id: number) {
  scope(account);
  return drafts.get(id);
}
export function writeDraft(account: number | null, id: number, draft: Draft) {
  scope(account);
  drafts.set(id, draft);
}
export function clearDraft(account: number | null, id: number) {
  scope(account);
  drafts.delete(id);
}
export function resetDrafts(account: number | null) {
  scope(account);
}
