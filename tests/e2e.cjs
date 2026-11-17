// End-to-end test against LOCAL Supabase + `npm start` on :3000, phone-sized.
// Run: bash tests/reset-local.sh && node tests/e2e.cjs
// Needs: playwright (global), /tmp/e2e/place.jpg and /tmp/e2e/brief.pdf (see tests/make-fixtures.py)
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs')

const BASE = 'http://127.0.0.1:3000'
const MAIL = 'http://127.0.0.1:54324/api/v1'
const SHOTS = path.join(__dirname, '..', 'docs', 'screenshots')
const FIX = process.env.E2E_FIXTURES || '/tmp/e2e'
fs.mkdirSync(SHOTS, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  -> ' + String(detail).slice(0, 220) : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const main = (page) => page.locator('main').innerText()
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true })

async function latestCode(email, after) {
  for (let i = 0; i < 40; i++) {
    const r = await (await fetch(`${MAIL}/search?query=${encodeURIComponent('to:' + email)}`)).json()
    const m = (r.messages || []).find((m) => new Date(m.Created) > after)
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
  const t = new Date(Date.now() - 4000)
  await page.fill('#email', email)
  await page.click('text=Send login code')
  await page.waitForSelector('#code')
  await page.fill('#code', await latestCode(email, t))
  await page.click('button:has-text("Log in")')
  await page.waitForURL((u) => u.pathname === '/dashboard')
  return { ctx, page }
}

/** Open a <details> panel by its summary text, unless it is already open. */
async function openPanel(page, text) {
  const d = page.locator('details', { has: page.locator(`summary:has-text("${text}")`) }).first()
  if (!(await d.evaluate((el) => el.open))) await d.locator('summary').first().click()
}

/** Open the shoot day whose title contains `title`. */
async function openShoot(page, title) {
  await page.goto(BASE + '/shoots')
  await page.locator('main a', { hasText: title }).first().click()
  await page.waitForURL(/\/shoots\/[0-9a-f-]{36}$/)
}

;(async () => {
  const browser = await chromium.launch()

  // ================= login =================
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(BASE + '/login')
    await page.fill('#email', 'stranger@gmail.com')
    await page.click('text=Send login code')
    await page.waitForSelector('main [role=alert]')
    check('uninvited email is refused', /not been invited/.test(await page.locator('main [role=alert]').innerText()))
    await shot(page, '01-login')
    await page.goto(BASE + '/dashboard')
    check('logged-out visitor is sent to login', page.url().includes('/login'))
    await ctx.close()
  }

  // ================= Sara (model): decline with a reason =================
  {
    const { ctx, page } = await login(browser, 'sara@example.com')
    let t = await main(page)
    check('model lands on a home screen with her name', /Sara/.test(t) && /Will you be there/.test(t), t.slice(0, 200))
    check('home shows the next shoot with meeting time and place', /Sunset desert shoot/.test(t) && /15:00/.test(t) && /Arabian Night camp/.test(t))
    check('home shows who will be there', /Hala/.test(t) && /Zaid/.test(t) && /Karim/.test(t) && /Omar/.test(t))
    check('model has no manager navigation', (await page.locator('nav a[href="/people"], nav a[href="/pay-manager"]').count()) === 0)
    await shot(page, '02-home-model')

    await openShoot(page, 'Sunset desert shoot')
    t = await main(page)
    check('shoot day shows meeting point and time', /Parking, next to the main gate/.test(t) && /15:00/.test(t))
    check('shoot day shows location and a maps link', /Desert road/.test(t) && (await page.locator('a[href="https://maps.app.goo.gl/example"]').count()) === 1)
    check('shoot day shows the script (Arabic + English)', /المشهد الأول/.test(t) && /Sara walks into the tent/.test(t))
    check('model sees the full crew with answers', /Hala/.test(t) && /Omar Organizer/.test(t))
    check('model cannot add photos, scripts or crew', !/Add photos|Write a script|Add people|Manage this shoot day|Edit details/.test(t))
    await shot(page, '03-shoot-model')

    // decline needs a reason (the field is required)
    await page.locator('summary:has-text("I can\'t make it")').click()
    await page.locator('button:has-text("Decline this day")').click()
    await sleep(500)
    check('decline without a reason does not go through', !/Declined\. The manager was told/.test(await main(page)))
    await page.locator('textarea[name=reason]').fill('I have an exam that morning')
    await page.locator('button:has-text("Decline this day")').click()
    await page.waitForSelector('text=Your reason:')
    t = await main(page)
    check('model sees her declined state and her reason', /Declined/.test(t) && /exam that morning/.test(t))

    // privacy
    for (const p of ['/people', '/pay-manager']) {
      await page.goto(BASE + p)
      check(`model is kept out of ${p}`, !page.url().endsWith(p), page.url())
    }
    await page.goto(BASE + '/pay')
    t = await main(page)
    check('model sees her own pay: 500 EGP paid', /500\s*EGP/.test(t) && /Paid/.test(t) && !/Hala/.test(t), t.slice(0, 250))
    await shot(page, '04-pay-model')

    // announcements: only what is assigned
    await page.goto(BASE + '/announcements')
    check('model sees the announcement assigned to her', /Call time for Friday/.test(await main(page)))
    const html = await page.content()
    check('model page has no other people\'s emails', !/@example\.com/.test(html.replace('sara@example.com', '')))
    await ctx.close()
  }

  // ================= Manager =================
  {
    const { ctx, page } = await login(browser, 'manager@example.com')
    let t = await main(page)
    check('manager home shows the decline with its reason', /Declined/.test(t) && /exam that morning/.test(t), t.slice(0, 300))
    check('manager home shows progress bars', (await page.locator('[role=progressbar]').count()) >= 3)
    await shot(page, '05-home-manager')

    // new shoot day with details + crew
    await page.goto(BASE + '/shoots#new')
    const form = page.locator('#new')
    await form.locator('select[name=date]').selectOption('2026-11-28')
    await form.locator('input[name=title]').fill('Majlis night')
    await form.locator('input[name=start_time]').fill('18:00')
    await form.locator('input[name=meeting_time]').fill('17:00')
    await form.locator('input[name=meeting_point]').fill('Reception')
    await form.locator('input[name=location_name]').fill('Arabian Night camp')
    await form.locator('input[name=location_url]').fill('maps.app.goo.gl/new')
    for (const n of ['Sara', 'Hala', 'Karim Photo', 'Omar Organizer']) await form.locator('label', { hasText: n }).first().click()
    await form.locator('button:has-text("Create shoot day")').click()
    await page.waitForURL(/\/shoots\/[0-9a-f-]{36}$/)
    t = await main(page)
    check('manager creates a shoot day with crew and details', /Majlis night/.test(t) && /Reception/.test(t) && /Sara/.test(t) && /Omar Organizer/.test(t))
    check('map link without https:// is fixed', (await page.locator('a[href="https://maps.app.goo.gl/new"]').count()) === 1)
    const newDayUrl = page.url()

    // script typed in
    await page.locator('summary:has-text("Write a script")').click()
    await page.fill('#script-title', 'Video 2 – Hala')
    await page.fill('#script-body', 'مرحباً بكم في ليالي عربية')
    await page.locator('button:has-text("Add script")').click()
    await page.waitForSelector('text=Script added')
    check('manager adds a typed script', /مرحباً بكم/.test(await main(page)))

    // fee for the photographer
    const karim = page.locator('li.row', { hasText: 'Karim Photo' })
    await karim.locator('summary:has-text("Manage")').click()
    await karim.locator('input[name=amount]').fill('900')
    await karim.locator('button:has-text("Save fee")').click()
    await page.waitForSelector('text=Fee saved.')
    check('manager sets the photographer\'s agreed fee', true)

    // announcement to Hala only
    await page.goto(BASE + '/announcements')
    await openPanel(page, 'New announcement')
    await page.fill('#announcement-title', 'Only for Hala')
    await page.fill('#announcement-body', 'Wardrobe fitting at 11.')
    await page.locator('fieldset label', { hasText: 'Hala' }).first().click()
    await page.locator('button:has-text("Publish")').last().click()
    await page.waitForSelector('text=Published to 1 person.')
    check('manager publishes an announcement to one person', true)

    // file upload (direct to storage) to Sara + Hala
    await page.goto(BASE + '/files')
    await openPanel(page, 'Share a file')
    await page.setInputFiles('#shared-file', path.join(FIX, 'brief.pdf'))
    await page.fill('#file-description', 'Call sheet')
    await page.locator('fieldset label', { hasText: 'Sara' }).first().click()
    await page.locator('button:has-text("Upload and share")').click()
    await page.waitForSelector('text=File shared with 1 person.')
    check('manager uploads and shares a file', /brief\.pdf/.test(await main(page)))
    await shot(page, '06-files-manager')
    await ctx.close()
    fs.writeFileSync('/tmp/e2e/newday.txt', newDayUrl)
  }

  // ================= Hala: privacy of announcements, comment, review =================
  {
    const { ctx, page } = await login(browser, 'hala@example.com')
    await page.goto(BASE + '/announcements')
    let t = await main(page)
    check('Hala sees the announcement meant for her', /Only for Hala/.test(t) && /Call time for Friday/.test(t))
    await page.goto(BASE + '/files')
    check('Hala does not see the file assigned to Sara only', !/brief\.pdf/.test(await main(page)))

    await page.goto(BASE + '/announcements')
    const card = page.locator('article', { hasText: 'Only for Hala' })
    await card.locator('summary:has-text("Add a comment")').click()
    await card.locator('textarea').fill('Got it, thank you')
    await card.locator('button:has-text("Post comment")').click()
    await page.waitForSelector('text=Comment posted.')
    await card.locator('button:has-text("Mark reviewed")').click()
    await page.waitForSelector('text=Marked as reviewed.')
    t = await main(page)
    check('model comments on and reviews an announcement', /Got it, thank you/.test(t) && /Reviewed by Hala/.test(t))

    // she accepts a shoot
    await openShoot(page, 'Majlis night')
    await page.locator('button:has-text("Accept")').first().click()
    await page.waitForSelector('text=You accepted')
    check('model accepts a shoot', /You accepted/.test(await main(page)))
    await shot(page, '07-announcements-model')
    await ctx.close()
  }

  // ================= Sara downloads her file and comments =================
  {
    const { ctx, page } = await login(browser, 'sara@example.com')
    await page.goto(BASE + '/files')
    check('Sara sees her file', /brief\.pdf/.test(await main(page)))
    const res = await ctx.request.get(BASE + (await page.locator('a:has-text("Open")').first().getAttribute('href')), { maxRedirects: 5 })
    check('Sara can download her file', res.ok() && (await res.body()).slice(0, 4).toString() === '%PDF', res.status())
    const card = page.locator('article', { hasText: 'brief.pdf' })
    await card.locator('summary:has-text("Add a comment")').click()
    await card.locator('textarea').fill('Received')
    await card.locator('button:has-text("Post comment")').click()
    await page.waitForSelector('text=Comment posted.')
    check('model comments on a file', true)
    await ctx.close()
  }

  // ================= Organizer: location + photo =================
  {
    const { ctx, page } = await login(browser, 'omar@example.com')
    let t = await main(page)
    check('organizer sees the dashboard', /Omar/.test(t))
    await openShoot(page, 'Majlis night')
    t = await main(page)
    check('organizer can add location and photos but not scripts or crew', /Change location/.test(t) && /Add photos/.test(t) && !/Write a script|Add people|Manage this shoot day/.test(t))

    await page.locator('summary:has-text("Change location")').click()
    await page.fill('#loc-name', 'Arabian Night camp – east tent')
    await page.fill('#loc-addr', 'Turn left after the second gate')
    await page.locator('button:has-text("Save location")').click()
    await page.waitForSelector('text=Location saved.')
    check('organizer sets the location', /east tent/.test(await main(page)) && /second gate/.test(await main(page)))

    await page.locator('summary:has-text("Add photos")').click()
    await page.setInputFiles('input[type=file][accept*="image/jpeg"]', path.join(FIX, 'place.jpg'))
    await page.locator('button:has-text("Upload photos")').click()
    await page.waitForSelector('text=1 photo uploaded.')
    await page.waitForSelector('img[alt]')
    const img = await page.locator('main img').first()
    const w = await img.evaluate((el) => el.naturalWidth)
    check('organizer uploads a photo (shrunk to 1920px) and it displays', w > 0 && w <= 1920, w)
    await shot(page, '08-shoot-organizer')

    // a non-image cannot go in the photo uploader
    await page.goto(BASE + '/people')
    check('organizer is kept out of People', !page.url().endsWith('/people'))
    await ctx.close()
  }

  // ================= Photographer: sees everything, comments =================
  {
    const { ctx, page } = await login(browser, 'photo@example.com')
    await page.goto(BASE + '/announcements')
    check('photographer sees every announcement', /Only for Hala/.test(await main(page)) && /Call time for Friday/.test(await main(page)))
    await page.goto(BASE + '/files')
    check('photographer sees every file', /brief\.pdf/.test(await main(page)))

    await openShoot(page, 'Majlis night')
    const t = await main(page)
    check('photographer sees the place photo and the new location', /east tent/.test(t) && (await page.locator('main img').count()) === 1)
    check('photographer cannot edit anything on the shoot', !/Add photos|Change location|Write a script|Add people|Manage this shoot day/.test(t))

    const photo = page.locator('li.row', { has: page.locator('img') })
    await photo.locator('summary:has-text("Add a comment")').click()
    await photo.locator('textarea').fill('Great light here')
    await photo.locator('button:has-text("Post comment")').click()
    await page.waitForSelector('text=Comment posted.')
    check('photographer comments on a place photo', /Great light here/.test(await main(page)))

    const script = page.locator('li.row', { hasText: 'Video 2' })
    await script.locator('button:has-text("Mark reviewed")').click()
    await page.waitForSelector('text=Marked as reviewed.')
    check('photographer marks a script reviewed', /Reviewed by Karim Photo/.test(await main(page)))

    // pay: only own
    await page.goto(BASE + '/pay')
    const t2 = await main(page)
    check('photographer sees only her own pay (800 from the earlier shoot)', /800\s*EGP/.test(t2) && !/Hala|Sara/.test(t2))
    await ctx.close()
  }

  // ================= Manager: comments arrive, completion creates pay =================
  {
    const { ctx, page } = await login(browser, 'manager@example.com')
    await page.goto(BASE + '/notifications')
    let t = await main(page)
    check('manager was notified of the answers and comments',
      /Sara declined/.test(t) && /Hala accepted/.test(t) && /New comment from Hala/.test(t) && /New comment from Karim Photo/.test(t), t.slice(0, 400))

    await page.goto(fs.readFileSync('/tmp/e2e/newday.txt', 'utf8'))
    t = await main(page)
    check('manager sees Sara (no answer yet) and Hala (accepted) on the new day', /No answer yet/.test(t) && /Accepted/.test(t))

    await page.locator('button:has-text("Mark completed")').click()
    await page.locator('button:has-text("Back to planned")').waitFor()
    await page.goto(BASE + '/pay-manager')
    t = await main(page)
    // 14 Nov: Sara 500 (paid) + Hala 500 + Karim 800 ; Majlis: Sara 500, Hala 500, Karim 900 (fee), Omar none
    const amounts = await page.locator('input[name=amount]').evaluateAll((els) => els.map((e) => Number(e.value)).sort((a, b) => a - b))
    check('completing a day adds pay lines (3 models at 500, photographer 800 + 900, organizer none)',
      JSON.stringify(amounts) === JSON.stringify([500, 500, 500, 500, 800, 900]), JSON.stringify(amounts))
    check('pay totals add up: 3,700 EGP total', /3,700\s*EGP/.test(t), t.slice(0, 200))
    const row = page.locator('li.row', { has: page.locator('button:has-text("Mark paid")') }).filter({ hasText: 'Hala' }).first()
    await row.locator('button:has-text("Mark paid")').click()
    await page.waitForSelector('text=Marked paid.')
    check('manager marks a payment paid', true)
    await shot(page, '09-pay-manager')

    await page.goto(BASE + '/people')
    await page.locator('summary:has-text("Invite someone")').click()
    check('manager can invite an organizer role', (await page.locator('#new-role option[value=organizer]').count()) === 1)
    await shot(page, '10-people')
    await ctx.close()
  }

  await browser.close()
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n${results.length - failed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
})().catch((e) => {
  console.error(e)
  process.exit(2)
})
