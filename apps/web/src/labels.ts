import { api } from "./api";

/** Open a tab synchronously from the user's click (so Safari permits it), then
 *  fill it with the authenticated label sheet returned by the API. */
export async function printLabelSheet(ids: string[]): Promise<void> {
  if (ids.length === 0) throw new Error("Choose at least one label");
  const tab = window.open("", "_blank");
  if (!tab) throw new Error("Allow pop-ups for EatMe to open the print sheet");

  try {
    tab.document.title = "Preparing EatMe labels";
    tab.document.body.textContent = "Preparing labels…";
    const html = await api.labelSheet(ids);
    tab.document.open();
    tab.document.write(html);
    tab.document.close();
  } catch (error) {
    tab.close();
    throw error;
  }
}
