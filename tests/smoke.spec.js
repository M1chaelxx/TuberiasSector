import { test, expect } from '@playwright/test'

// Helper: login como Ingeniería
async function login(page) {
  await page.goto('/#/login')
  await page.locator('select').selectOption('Ingeniería')
  await page.getByPlaceholder('Ingresá tu contraseña').fill('Ingenieria2026')
  await page.getByRole('button', { name: /ingresar/i }).click()
  await page.waitForURL('**/#/')
}

// Helper: esperar que desaparezca el spinner
async function waitForContent(page) {
  await page.waitForFunction(() => !document.querySelector('.spin'), { timeout: 10000 })
}

// ─── 1. Login ──────────────────────────────────────────────────────────────
test('login correcto lleva al Home', async ({ page }) => {
  await page.goto('/#/login')
  await expect(page.locator('select')).toBeVisible()
  await page.locator('select').selectOption('Ingeniería')
  await page.getByPlaceholder('Ingresá tu contraseña').fill('Ingenieria2026')
  await page.getByRole('button', { name: /ingresar/i }).click()
  await page.waitForURL('**/#/')
  await expect(page.getByText('Soldadura')).toBeVisible()
  await expect(page.getByText('Tuberías')).toBeVisible()
})

test('login incorrecto muestra error', async ({ page }) => {
  await page.goto('/#/login')
  await page.locator('select').selectOption('Ingeniería')
  await page.getByPlaceholder('Ingresá tu contraseña').fill('claveMal')
  await page.getByRole('button', { name: /ingresar/i }).click()
  // Debe seguir en login
  await expect(page).toHaveURL(/login/)
})

test('sin login redirige a /login', async ({ page }) => {
  await page.goto('/#/soldadura')
  await expect(page).toHaveURL(/login/)
})

// ─── 2. Soldadura Home ────────────────────────────────────────────────────
test('Soldadura Home carga lista de modelos', async ({ page }) => {
  await login(page)
  await page.goto('/#/soldadura')
  await waitForContent(page)
  // Debe mostrar chips de navegación
  await expect(page.getByText('Tiempos')).toBeVisible()
  await expect(page.getByText('Takt Time')).toBeVisible()
  await expect(page.getByText('Distribución')).toBeVisible()
  // Ingeniería debe ver botón de importar Excel
  await expect(page.getByText('Cargar Excel')).toBeVisible()
})

test('chip Takt Time navega a /soldadura/takttime', async ({ page }) => {
  await login(page)
  await page.goto('/#/soldadura')
  await page.getByText('Takt Time').click()
  await expect(page).toHaveURL(/takttime/)
  await expect(page.getByText('⏱ Takt Time')).toBeVisible()
  await expect(page.getByText('🔄 Ciclos')).toBeVisible()
})

test('chip Distribución navega a /soldadura/balance', async ({ page }) => {
  await login(page)
  await page.goto('/#/soldadura')
  await page.getByText('Distribución').click()
  await expect(page).toHaveURL(/balance/)
  await expect(page.getByText('Balance')).toBeVisible()
  await expect(page.getByText('Cobertura')).toBeVisible()
})

// ─── 3. Soldadura — modelos y subconjuntos ───────────────────────────────
test('ruta /soldadura/m/:modelo renderiza la página de capacidades', async ({ page }) => {
  await login(page)
  // Navegar directamente al modelo (sin depender de que Firebase liste las tarjetas)
  await page.goto('/#/soldadura/m/WRAC%202025')
  await expect(page).toHaveURL(/soldadura\/m\//)
  // La página de capacidades debe renderizarse (sin crash, app visible)
  await expect(page.locator('.app')).toBeVisible()
  await expect(page.locator('h1')).toBeVisible()
})

// ─── 4. SC069: Vista Completo por defecto — fix V151 ────────────────────
// V151 corrige que al navegar a SC069 sin state, muestra el Completo (no el Parcial).
// La vista Parcial (forcePartial=true) se verifica en la app real ya que requiere
// que Firebase cargue los datos para mostrar el click desde sub-componentes.
test('SC069 muestra vista Completo por defecto (fix V151)', async ({ page }) => {
  await login(page)
  await page.goto('/#/soldadura/WRAC%202025_12FS/SC069')
  // Esperar a que el spinner desaparezca (loading=false se activa cuando onSnapshot responde)
  await waitForContent(page)
  // Sin forcePartial en el state: la página debe mostrar "Cod. Completo", NO "Cod. Parcial"
  await expect(page.getByText('Cod. Completo')).toBeVisible()
  await expect(page.getByText('Cod. Parcial')).not.toBeVisible()
})

// ─── 5. Takt Time — solapas ───────────────────────────────────────────────
test('Takt Time tiene solapa Ciclos con selector de modelo', async ({ page }) => {
  await login(page)
  await page.goto('/#/soldadura/takttime')
  await expect(page.getByText('🔄 Ciclos')).toBeVisible()
  await page.getByText('🔄 Ciclos').click()
  await waitForContent(page)
  // Debe mostrar un selector de modelo
  await expect(page.locator('select').first()).toBeVisible()
})

// ─── 6. Balance — carga sin errores ──────────────────────────────────────
test('Balance carga correctamente', async ({ page }) => {
  await login(page)
  await page.goto('/#/soldadura/balance')
  await waitForContent(page)
  await expect(page.getByText('Balance')).toBeVisible()
  await expect(page.getByText('Cobertura')).toBeVisible()
  // Selectores de modelo visibles
  const selects = page.locator('select')
  await expect(selects.first()).toBeVisible()
})

// ─── 7. Back navigation ───────────────────────────────────────────────────
test('botón back desde Takt Time vuelve a Soldadura', async ({ page }) => {
  await login(page)
  await page.goto('/#/soldadura/takttime')
  // Click en el header back
  await page.locator('.header-back, [class*="back"]').first().click()
  await expect(page).toHaveURL(/\/#\/soldadura$/)
})

// ─── 8. Producción — NO ve Cargar Excel ──────────────────────────────────
test('usuario Producción no ve botón Cargar Excel', async ({ page }) => {
  await page.goto('/#/login')
  await page.locator('select').selectOption('Producción')
  await page.getByPlaceholder('Ingresá tu contraseña').fill('Produccion2026')
  await page.getByRole('button', { name: /ingresar/i }).click()
  await page.waitForURL('**/#/')
  await page.goto('/#/soldadura')
  await waitForContent(page)
  await expect(page.getByText('Cargar Excel')).not.toBeVisible()
  await expect(page.getByText('Cargar Imágenes')).not.toBeVisible()
})
