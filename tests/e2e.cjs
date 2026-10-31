// End-to-end test against LOCAL Supabase + `npm start` on :3000.
// Run: bash tests/reset-local.sh && node tests/e2e.cjs
const { chromium } = require('playwright')
const BASE = 'http://127.0.0.1:3000'
const MAIL = 'http://127.0.0.1:54324/api/v1'
const shots = require('path').join(__dirname, '..', 'docs', 'screenshots')
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail && !ok ? '  -> ' + detail : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function latestCode(email, after) {
  for (let i = 0; i < 30; i++) {
    const r = await (await fetch(`${MAIL}/search?query=${encodeURIComponent('to:' + email)}`)).json()
    const m = (r.messages || []).find((m) => new Date(m.Created) > after && /login code/i.test(m.Subject))
    if (m) {
      const full = await (await fetch(`${MAIL}/message/${m.ID}`)).json()
      const code = (full.Text || full.HTML).match(/\b(\d{6})\b/)
      if (code) return code[1]
    }
    await sleep(500)
  }
  throw new Error('no code email for ' + email)
}

async function login(browser, email) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(BASE + '/login')
  const t = new Date(Date.now() - 5000)
  await page.fill('#email', email)
  await page.click('text=Send login code')
  await page.waitForSelector('#code')
  const code = await latestCode(email, t)
  await page.fill('#code', code)
  await page.click('button:has-text("Log in")')
  await page.waitForURL((u) => /\/(calendar|dashboard)$/.test(u.pathname))
  return { ctx, page }
}
const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true })
const body = async (page) => (await page.locator('main').innerText()).replace(/\u00a0/g, ' ')

;(async () => {
  const browser = await chromium.launch()

  // ---------- uninvited email ----------
  {
    const ctx = await browser.newContext(); const page = await ctx.newPage()
    await page.goto(BASE + '/login'); await page.fill('#email', 'stranger@gmail.com'); await page.click('text=Send login code')
    await page.waitForSelector('main [role=alert]')
    const a = await page.locator('main [role=alert]').innerText()
    check('uninvited email is refused at login', /not been invited/.test(a), a)
    await shot(page, '01-login'); await ctx.close()
  }

  // ---------- Sara (model) ----------
  {
    const { ctx, page } = await login(browser, 'sara@example.com')
    check('model lands on My calendar', page.url().endsWith('/calendar'))
    let txt = await body(page)
    check('Sara sees her own offered hours (5 windows = 22 h)', /offered\s+22 h/.test(txt), txt.slice(0, 200))
    check('Sara sees nothing of Mona', !/Mona/.test(await page.content()))
    await page.goto(BASE + '/calendar?date=2026-11-12')
    txt = await body(page)
    check('split day shows both windows', /09:00 – 12:00/.test(txt) && /15:00 – 18:00/.test(txt))
    await shot(page, '02-model-calendar')

    // add a window on Nov 30 (pre-ticked via ?date)
    await page.goto(BASE + '/calendar?date=2026-11-30')
    await page.selectOption('#av-start', '10:00'); await page.selectOption('#av-end', '14:00')
    await page.click('button:has-text("Add window")')
    await page.waitForSelector('main [role=status]')
    check('model adds a 4 h window', /Added 10:00–14:00/.test(await page.locator('main [role=status]').innerText()))
    // try to exceed 6h on same day
    await page.goto(BASE + '/calendar?date=2026-11-30')
    await page.selectOption('#av-start', '15:00'); await page.selectOption('#av-end', '18:00')
    await page.click('button:has-text("Add window")')
    await page.waitForSelector('main [role=alert]')
    const err = (await page.locator('main [role=alert]').allInnerTexts()).join(' | ')
    check('7th hour on a day is refused with a clear message', /Maximum is 6 hours/.test(err), err)

    await page.goto(BASE + '/progress'); txt = await body(page)
    check('My progress shows 2 booked days (11 h? no: 12 h)', /Hours booked\s+12 h/.test(txt), txt.slice(0, 300))
    await shot(page, '03-model-progress')
    await page.goto(BASE + '/pay'); txt = await body(page)
    check('My pay shows own total 3,000 EGP, paid', /Total earned\s+3,000 EGP/.test(txt) && /paid/.test(txt), txt.slice(0, 300))
    await shot(page, '04-model-pay')

    for (const p of ['/dashboard', '/people', '/pay-manager']) {
      await page.goto(BASE + p)
      check(`model is kept out of ${p}`, !page.url().endsWith(p), page.url())
    }
    await ctx.close()
  }

  // ---------- Mona (model) answers her offer ----------
  {
    const { ctx, page } = await login(browser, 'mona@example.com')
    const html = await page.content()
    check('Mona sees nothing of Sara', !/Sara/.test(html))
    check('Mona sees the offer waiting for her', /waiting for your answer/.test(html))
    await page.locator('section:has-text("waiting for your answer") button:has-text("Accept")').first().click()
    await page.waitForSelector('text=My confirmed shoot days')
    check('Mona accepts her offered day (moves to confirmed)', /Wed 18 Nov[\s\S]*confirmed/.test(await body(page)) && !/waiting for your answer/.test(await body(page)))
    await shot(page, '05-model2-calendar')
    await ctx.close()
  }

  // ---------- Manager ----------
  {
    const { ctx, page } = await login(browser, 'manager@example.com')
    check('manager lands on dashboard', page.url().endsWith('/dashboard'))
    let txt = await body(page)
    // booked: Sara 11-10 completed, Mona 11-11 completed, Sara 11-15 confirmed, Mona 11-18 now confirmed = 4 days, 24 h
    check('hours booked bar = 24 / 54', /24 h \/ 54 h/.test(txt), txt.slice(0, 400))
    check('videos assigned bar = 18 / 40', /18 \/ 40/.test(txt))
    check('manager sees both models', /Sara/.test(txt) && /Mona/.test(txt))
    await shot(page, '06-manager-dashboard')

    // mark Sara's Nov 15 day completed
    const li = page.locator('li', { has: page.locator('strong', { hasText: 'Sun 15 Nov' }) }).first()
    await li.locator('summary:has-text("Edit")').click()
    await li.locator('select[name=status]').selectOption('completed')
    await li.locator('button:has-text("Save")').first().click()
    await li.locator('[role=status]').waitFor()
    check('manager marks a shoot day completed', true)

    await page.goto(BASE + '/pay-manager'); txt = await body(page)
    check('completed day appears in Pay manager (3 days)', (txt.match(/Mark (not )?paid/g) || []).length === 3, txt.slice(0, 500))
    const row = page.locator('li', { hasText: 'Sun 15 Nov' })
    await row.locator('button:has-text("Mark paid")').click()
    await row.locator('button:has-text("Mark not paid")').waitFor()
    await page.goto(BASE + '/pay-manager'); txt = await body(page)
    check('totals update after marking paid (6,000 paid / 9,000 total)', /9,000 EGP\s+6,000 EGP\s+3,000 EGP/.test(txt), txt.slice(0, 600))
    await shot(page, '07-pay-manager')

    await page.goto(BASE + '/people')
    await page.fill('#new-name', 'Assistant'); await page.fill('#new-email', 'assistant@gmail.com')
    await page.selectOption('#new-role', 'member'); await page.selectOption('#new-access', 'view')
    await page.click('button:has-text("Invite")')
    await page.waitForSelector('main [role=status]')
    const msg = await page.locator('main [role=status]').innerText()
    check('manager invites a view-only member and the email is sent', /Invite email sent/.test(msg), msg)
    await shot(page, '08-people')
    await ctx.close()
  }

  // ---------- invited view-only member ----------
  {
    const r = await (await fetch(`${MAIL}/search?query=${encodeURIComponent('to:assistant@gmail.com')}`)).json()
    check('invite email delivered', (r.messages || []).some((m) => /login code/i.test(m.Subject)))
    const { ctx, page } = await login(browser, 'assistant@gmail.com')
    check('member lands on dashboard', page.url().endsWith('/dashboard'))
    const txt = await body(page)
    check('member sees all schedules', /Sara/.test(txt) && /Mona/.test(txt))
    check('view-only member has no edit controls', !(await page.locator('summary:has-text("Edit")').count()) && !/Add a shoot day/.test(txt))
    await page.goto(BASE + '/pay-manager')
    check('member is kept out of Pay manager', !page.url().endsWith('/pay-manager'))
    await shot(page, '09-member-dashboard')
    await ctx.close()
  }

  // ---------- invite link path ----------
  {
    const { ctx, page } = await login(browser, 'manager@example.com')
    await page.goto(BASE + '/people')
    await page.fill('#new-name', 'New Model'); await page.fill('#new-email', 'newmodel@gmail.com')
    await page.selectOption('#new-role', 'model')
    await page.click('button:has-text("Invite")')
    await page.waitForSelector('main [role=status]')
    await ctx.close()
    await sleep(800)
    const r = await (await fetch(`${MAIL}/search?query=${encodeURIComponent('to:newmodel@gmail.com')}`)).json()
    const full = await (await fetch(`${MAIL}/message/${r.messages[0].ID}`)).json()
    const link = full.HTML.match(/href="([^"]*auth\/confirm[^"]*)"/)[1].replace(/&amp;/g, '&')
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p2 = await c2.newPage()
    await p2.goto(link)
    await p2.waitForURL((u) => u.pathname === '/calendar')
    const t = await p2.locator('main').innerText()
    check('invite link logs the new model straight in, with an empty calendar', /offered\s+0 h/.test(t), t.slice(0, 200))
    check('new model sees no one else', !/Sara|Mona/.test(await p2.content()))
    await c2.close()
  }

  // ---------- Sara again: now sees new completed day in pay ----------
  {
    const { ctx, page } = await login(browser, 'sara@example.com')
    await page.goto(BASE + '/pay')
    const txt = await body(page)
    check('Sara now sees 6,000 EGP total, all paid', /Total earned\s+6,000 EGP/.test(txt) && /Not paid yet\s+0 EGP/.test(txt), txt.slice(0, 300))
    await ctx.close()
  }

  await browser.close()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => { console.error(e); process.exit(2) })
