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

const PASSWORD = 'Test-pass-123'

async function newMail(email, after, subjectPart) {
  for (let i = 0; i < 40; i++) {
    const r = await (await fetch(`${MAIL}/search?query=${encodeURIComponent('to:' + email)}`)).json()
    const m = (r.messages || []).find((m) => new Date(m.Created) > after && (!subjectPart || m.Subject.includes(subjectPart)))
    if (m) return await (await fetch(`${MAIL}/message/${m.ID}`)).json()
    await sleep(500)
  }
  throw new Error(`no email "${subjectPart || ''}" for ${email}`)
}
const latestCode = async (email, after) => {
  const full = await newMail(email, after, 'reset code')
  return (full.Text || full.HTML).match(/\b(\d{6})\b/)[1]
}
// Every phone in these tests tells the app "reduce motion" (like a Windows PC with animation
// effects off). The app must move anyway, so the motion checks below prove exactly that.
const phone = (browser) =>
  browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' })

async function login(browser, email, password = PASSWORD) {
  const ctx = await phone(browser)
  const page = await ctx.newPage()
  await page.goto(BASE + '/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button:has-text("Log in")')
  await page.waitForURL((u) => u.pathname === '/dashboard')
  return { ctx, page }
}

async function logout(page) {
  await page.goto(BASE + '/me')
  await page.click('button:has-text("Log out")')
  await page.waitForURL((u) => u.pathname === '/login')
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
  let inviteLink = ''
  const browser = await chromium.launch()

  // ================= login page =================
  {
    const ctx = await browser.newContext()
    const page = await ctx.newPage()
    await page.goto(BASE + '/login')
    check('login page asks for email and password (no login code)',
      (await page.locator('#password').count()) === 1 && (await page.locator('text=Send login code').count()) === 0)
    await page.fill('#email', 'stranger@gmail.com')
    await page.fill('#password', 'whatever-123')
    await page.click('button:has-text("Log in")')
    await page.waitForSelector('main [role=alert]')
    const msg1 = await page.locator('main [role=alert]').innerText()
    check('unknown email is refused with the generic message', /Wrong email or password/.test(msg1), msg1)
    check('the email stays in the box after a failed login', (await page.inputValue('#email')) === 'stranger@gmail.com')
    await page.fill('#email', 'sara@example.com')
    await page.fill('#password', 'not-her-password')
    await page.click('button:has-text("Log in")')
    await page.locator('main [role=alert]', { hasText: 'Wrong email or password' }).waitFor()
    check('a wrong password gets the same message (does not reveal which part was wrong)', true)
    await shot(page, '01-login')
    await page.goto(BASE + '/dashboard')
    check('logged-out visitor is sent to login', page.url().includes('/login'))
    await page.goto(BASE + '/set-password')
    check('the set-password page needs a login', page.url().includes('/login'))
    await ctx.close()
  }

  // ================= forgot password: code by email, then a new password =================
  {
    const ctx = await phone(browser)
    const page = await ctx.newPage()
    await page.goto(BASE + '/login')
    await page.click('a:has-text("Forgot password")')
    await page.waitForURL(/forgot-password/)
    const t = new Date(Date.now() - 4000)
    await page.fill('#email', 'zaid@example.com')
    await page.click('button:has-text("Send me a code")')
    await page.waitForSelector('#code')
    check('forgot password asks for the 6-digit code and a new password', (await page.locator('#password').count()) === 1 && (await page.locator('#confirm').count()) === 1)
    const code = await latestCode('zaid@example.com', t)

    await page.fill('#code', '000000')
    await page.fill('#password', 'New-pass-456')
    await page.fill('#confirm', 'New-pass-456')
    await page.click('button:has-text("Save password and log in")')
    await page.locator('main [role=alert]', { hasText: 'wrong or has expired' }).waitFor()
    check('a wrong code is refused', true)
    check('the typed password stays after an error', (await page.inputValue('#password')) === 'New-pass-456')

    await page.fill('#code', code)
    await page.fill('#confirm', 'New-pass-457')
    await page.click('button:has-text("Save password and log in")')
    await page.locator('main [role=alert]', { hasText: 'do not match' }).waitFor()
    check('two different passwords are refused', true)

    await page.fill('#confirm', 'New-pass-456')
    await page.click('button:has-text("Save password and log in")')
    await page.waitForURL((u) => u.pathname === '/dashboard')
    check('the right code and a new password log the person in', /Zaid/.test(await main(page)))
    await logout(page)

    await page.fill('#email', 'zaid@example.com')
    await page.fill('#password', PASSWORD)
    await page.click('button:has-text("Log in")')
    await page.locator('main [role=alert]', { hasText: 'Wrong email or password' }).waitFor()
    check('the old password no longer works', true)
    await page.fill('#password', 'New-pass-456')
    await page.click('button:has-text("Log in")')
    await page.waitForURL((u) => u.pathname === '/dashboard')
    check('the new password works', true)
    await ctx.close()
  }

  // ================= reset codes cannot be used to flood an inbox =================
  {
    const ctx = await phone(browser)
    const page = await ctx.newPage()
    const since = new Date(Date.now() - 2000)
    for (let i = 0; i < 2; i++) {
      await page.goto(BASE + '/forgot-password')
      await page.fill('#email', 'hala@example.com')
      await page.click('button:has-text("Send me a code")')
      await page.waitForSelector('#code')
    }
    await page.goto(BASE + '/forgot-password')
    await page.fill('#email', 'nobody@gmail.com')
    await page.click('button:has-text("Send me a code")')
    await page.waitForSelector('#code')
    check('an address that is not on the team gets the same screen (does not reveal who is)', true)
    await sleep(2000)
    const count = async (who) =>
      ((await (await fetch(`${MAIL}/search?query=${encodeURIComponent('to:' + who)}`)).json()).messages || []).filter(
        (m) => new Date(m.Created) > since && m.Subject.includes('reset code'),
      ).length
    check('asking for a reset code twice in a row sends only one email', (await count('hala@example.com')) === 1, await count('hala@example.com'))
    check('an address that is not on the team gets no email', (await count('nobody@gmail.com')) === 0)
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
    check('shoot day shows a map link for the meeting spot', (await page.locator('a[href="https://maps.app.goo.gl/meet-example"]').count()) === 1)
    check('shoot day shows the meeting instructions', /Park in zone B\. Call Omar when you arrive\./.test(t) && /Bring your ID for the gate\./.test(t))
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
    await page.goto(BASE + '/me')
    check('account page offers Change password', (await page.locator('a[href="/set-password"]').count()) === 1)

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
    await form.locator('input[name=meeting_url]').fill('maps.app.goo.gl/meet-new')
    await form.locator('textarea[name=meeting_instructions]').fill('Ask for Omar at reception.')
    for (const n of ['Sara', 'Hala', 'Karim Photo', 'Omar Organizer']) await form.locator('label', { hasText: n }).first().click()
    await form.locator('button:has-text("Create shoot day")').click()
    await page.waitForURL(/\/shoots\/[0-9a-f-]{36}$/)
    t = await main(page)
    check('manager creates a shoot day with crew and details', /Majlis night/.test(t) && /Reception/.test(t) && /Sara/.test(t) && /Omar Organizer/.test(t))
    check('meeting link and instructions are saved and shown', (await page.locator('a[href="https://maps.app.goo.gl/meet-new"]').count()) === 1 && /Ask for Omar at reception\./.test(t))
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
    const listed = await page.locator('article', { hasText: 'brief.pdf' }).waitFor({ timeout: 8000 }).then(() => true, () => false)
    check('manager uploads and shares a file (it appears in the list without a reload)', listed)
    // split day: 2 h in the morning + 2 h in the evening
    await page.goto(BASE + '/shoots#new')
    const f2 = page.locator('#new')
    await f2.locator('select[name=date]').selectOption('2026-12-03')
    await f2.locator('input[name=title]').fill('Split day')
    await f2.locator('input[name=start_time]').fill('10:00')
    check('split fields are hidden until the option is ticked', (await f2.locator('input[name=second_start_time]').count()) === 0)
    await f2.locator('label', { hasText: 'Split into two sessions' }).click()
    check('split option shows the second session fields', (await f2.locator('input[name=second_start_time]').count()) === 1)
    await f2.locator('input[name=hours]').fill('3')
    await f2.locator('input[name=second_start_time]').fill('18:00')
    await f2.locator('input[name=second_hours]').fill('2')
    await f2.locator('button:has-text("Create shoot day")').click()
    await page.waitForSelector('#new [role=alert]')
    check('two sessions totalling over 4 hours are refused', /at most 4 hours/.test(await f2.locator('[role=alert]').innerText()))
    await f2.locator('input[name=hours]').fill('2')
    await f2.locator('input[name=second_start_time]').fill('11:00')
    await f2.locator('button:has-text("Create shoot day")').click()
    const early = await f2.locator('[role=alert]', { hasText: 'must start after the first one ends' }).waitFor({ timeout: 8000 }).then(() => true, () => false)
    check('a second session that starts before the first ends is refused', early)
    await f2.locator('input[name=second_start_time]').fill('18:00')
    await f2.locator('button:has-text("Create shoot day")').click()
    await page.waitForURL(/\/shoots\/[0-9a-f-]{36}$/)
    t = await main(page)
    check('split day shows both sessions and 4 h in total', /Session 1: 10:00–12:00/.test(t) && /Session 2: 18:00–20:00/.test(t) && /4 h in total/.test(t), t.slice(0, 300))
    await shot(page, '11-split-day')
    await page.goto(BASE + '/shoots')
    check('shoot list marks split days', /2 sessions/.test(await main(page)))

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
    await img.scrollIntoViewIfNeeded()
    const w = await img.evaluate(
      (el) => new Promise((resolve) => (el.complete && el.naturalWidth ? resolve(el.naturalWidth) : (el.onload = () => resolve(el.naturalWidth), setTimeout(() => resolve(el.naturalWidth), 8000)))),
    )
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

    // invite a new organizer: the email has a link where they choose a password
    await page.fill('#new-name', 'Newbie Organizer')
    await page.fill('#new-email', 'newbie@example.com')
    await page.selectOption('#new-role', 'organizer')
    const inviteAt = new Date(Date.now() - 4000)
    await page.getByRole('button', { name: 'Send invitation', exact: true }).click()
    await page.locator('main [role=status]', { hasText: 'Invitation email sent' }).waitFor()
    const invite = await newMail('newbie@example.com', inviteAt, 'choose your password')
    inviteLink = invite.HTML.match(/href="([^"]*auth\/confirm[^"]*)"/)[1].replace(/&amp;/g, '&')
    check('invitation email has a link to choose a password (no code)', /type=invite/.test(inviteLink) && !/\b\d{6}\b/.test(invite.Text.replace(/\d{4,}-\d+/g, '')), inviteLink)

    // "Resend invitation" for someone who already has an account sends a link to choose a new password
    const saraRow = page.locator('li', { hasText: 'sara@example.com' }).first()
    await saraRow.locator('summary:has-text("Edit")').click()
    const resendAt = new Date(Date.now() - 2000)
    await saraRow.locator('button:has-text("Resend invitation")').click()
    await saraRow.locator('[role=status]', { hasText: 'already had an account' }).waitFor()
    const resent = await newMail('sara@example.com', resendAt, 'choose your password')
    check('resending to an existing account emails a link to choose a password, not a code', /auth\/confirm/.test(resent.HTML) && !/reset code/i.test(resent.Subject || ''))

    // "Email check": a test email goes to the manager and the page reports the mail server's answer
    const testAt = new Date(Date.now() - 2000)
    await page.getByRole('button', { name: 'Send me a test email', exact: true }).click()
    await page.locator('main [role=status]', { hasText: 'Test email sent' }).waitFor()
    const test = await newMail('manager@example.com', testAt, 'email test')
    check('Email check sends a test email to the manager', /email setup works/.test(test.Text))
    const report = await page.locator('main [role=status]', { hasText: 'Test email sent' }).first().innerText()
    check('Email check shows the settings the app sees and never the password', /host 127\.0\.0\.1/.test(report) && /password not used/.test(report) && !/Test-pass/.test(report), report.slice(0, 300))
    await shot(page, '10-people')
    await ctx.close()
  }

  // ================= motion: screens move in depth (or not at all with "reduce motion") =================
  {
    const { ctx, page } = await login(browser, 'hala@example.com')
    await sleep(1200)
    /** Click, then report which screen-change animations ran. */
    const moves = async (click) => {
      await click()
      await page
        .waitForFunction(() => document.getAnimations().some((a) => (a.effect?.pseudoElement || '').includes('view-transition')), null, { timeout: 4000, polling: 'raf' })
        .catch(() => {})
      const names = await page.evaluate(() => document.getAnimations().map((a) => a.animationName || '').filter((n) => n.startsWith('vt-')))
      await sleep(900)
      return names.sort().join(',')
    }
    const next = await moves(() => page.locator('nav a[href="/shoots"]:visible').first().click())
    // Very rarely (about 1 in 15 taps) the app shows its default depth move instead of the
    // "toward you" one; that is harmless, so allow retries before calling it a failure.
    let open = ''
    let back = ''
    for (let attempt = 0; attempt < 3; attempt++) {
      open = await moves(() => page.locator('main a.row').first().click())
      back = await moves(() => page.locator('a:has-text("All shoot days")').click())
      if (open === 'vt-from-front,vt-push-back' && back === 'vt-from-back,vt-to-front') break
    }
    const prev = await moves(() => page.locator('nav a[href="/dashboard"]:visible').first().click())
    check('a tab to the right turns the screen left-to-right', next === 'vt-in-right,vt-out-left', next)
    check('opening a shoot day comes from the front', open === 'vt-from-front,vt-push-back', open)
    check('going back returns it', back === 'vt-from-back,vt-to-front', back)
    check('a tab to the left turns the other way', prev === 'vt-in-left,vt-out-right', prev)
    check('the device says reduce motion and the app still moves', await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches))
    const clean = await page.evaluate(() => {
      const m = document.querySelector('main')
      const hidden = [...m.querySelectorAll('*')].filter((el) => Number(getComputedStyle(el).opacity) < 0.5 && el.getBoundingClientRect().height > 0 && !el.closest('[aria-hidden]')).length
      const running = document.getAnimations().filter((a) => (a.effect?.pseudoElement || '').includes('view-transition')).length
      return hidden === 0 && running === 0
    })
    check('after the moves nothing is left faded or mid-air', clean)
    check('the screens ended in the right place', page.url().endsWith('/dashboard') && /Hala/.test(await main(page)))
    const pill = await page.locator('.tab-pill').evaluate((el) => getComputedStyle(el).transform)
    check('the tab highlight is back under Home', pill === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(pill), pill)
    await ctx.close()
  }

  // ================= invitation: link -> choose a password =================
  {
    const ctx = await phone(browser)
    const page = await ctx.newPage()
    await page.goto(inviteLink)
    await page.waitForURL(/set-password/)
    check('the invitation link opens the choose-a-password page', /Choose your password/.test(await main(page)))
    await shot(page, '12-set-password')
    await page.fill('#password', 'Newbie-pass-1')
    await page.fill('#confirm', 'Newbie-pass-2')
    await page.click('button:has-text("Save password")')
    await page.locator('main [role=alert]', { hasText: 'do not match' }).waitFor()
    check('the new person must type the same password twice', true)
    await page.fill('#confirm', 'Newbie-pass-1')
    await page.click('button:has-text("Save password")')
    await page.waitForURL((u) => u.pathname === '/dashboard')
    check('after choosing a password the new organizer is in', /Newbie/.test(await main(page)))
    await logout(page)
    await page.fill('#email', 'newbie@example.com')
    await page.fill('#password', 'Newbie-pass-1')
    await page.click('button:has-text("Log in")')
    await page.waitForURL((u) => u.pathname === '/dashboard')
    check('the new organizer can log in with email and password', true)

    const again = await phone(browser)
    const p2 = await again.newPage()
    await p2.goto(inviteLink)
    await p2.waitForURL(/\/login/)
    check('an invitation link works only once', /expired or was already used/.test(await main(p2)))
    await again.close()
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
