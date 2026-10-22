const { test, expect } = require('@playwright/test');
const { launch } = require('./helpers.cjs');

async function installLessonMock(app) {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('estudia:generate');
    ipcMain.handle('estudia:generate', async () => ({
      ok: true,
      value: { text: '## Lección de prueba\n\nContenido generado para comprobar la navegación.' }
    }));
  });
}

test('seleccionar una unidad desde Materias abre y muestra su lección', async () => {
  const { app, page, close } = await launch();
  try {
    await installLessonMock(app);

    await page.locator('[data-vista="materias"]').click();
    await page.getByRole('button', { name: 'Ver unidades' }).first().click();
    await expect(page.locator('.unit-item')).toHaveCount(6);

    await page.locator('.unit-item span').filter({ hasText: 'Álgebra' }).click();

    await expect(page.locator('#vista-leccion')).toBeVisible();
    await expect(page.locator('#leccion-cont')).toContainText('Lección de prueba');
  } finally {
    await close();
  }
});
