// 공통 Select의 실제 사용자 경로를 조작한다. 숨은 form 필드를 직접 변경하지 않는다.
export function selectField(page, label) {
  return page.getByRole('combobox', { name: label, exact: true }).locator('xpath=preceding-sibling::select[1]');
}
export async function selectValue(page, label, value) {
  const text = await selectField(page, label).locator(`option[value="${value}"]`).textContent();
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('listbox').getByRole('option', { name: text, exact: true }).click();
}
