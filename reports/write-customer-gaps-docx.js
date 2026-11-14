const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  LevelFormat,
} = require("docx");
const fs = require("fs");
const path = require("path");

const NAVY = "0A2635";
const ORANGE = "F79009";
const RED = "B42318";
const GREEN = "027A48";
const MUTED = "667085";
const LINE = "E4E7EC";
const PAGE = 9360; // A4 content width ~6.5"

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
  right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
};

const thin = (color = LINE) => ({
  style: BorderStyle.SINGLE,
  size: 4,
  color,
});

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: opts.after ?? 140, before: opts.before ?? 0, line: 276 },
    alignment: opts.align,
    children: [
      new TextRun({
        text,
        font: "Calibri",
        size: opts.size ?? 22,
        color: opts.color ?? "252525",
        bold: opts.bold,
        italics: opts.italics,
      }),
    ],
  });
}

function h1(text, opts = {}) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: opts.before ?? 280, after: 120 },
    keepNext: true,
    pageBreakBefore: Boolean(opts.pageBreak),
    children: [new TextRun({ text, font: "Calibri", size: 32, bold: true, color: NAVY })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 100 },
    keepNext: true,
    children: [new TextRun({ text, font: "Calibri", size: 26, bold: true, color: NAVY })],
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80, line: 276 },
    children: [new TextRun({ text, font: "Calibri", size: 22, color: "252525" })],
  });
}

function cell(text, opts = {}) {
  const line = thin(opts.header ? NAVY : LINE);
  return new TableCell({
    width: { size: opts.width, type: WidthType.DXA },
    shading: opts.fill
      ? { type: ShadingType.CLEAR, fill: opts.fill }
      : undefined,
    borders: { top: line, bottom: line, left: line, right: line },
    margins: { top: 80, bottom: 80, left: 90, right: 90 },
    verticalAlign: VerticalAlign.TOP,
    children: [
      new Paragraph({
        spacing: { after: 0, line: 240 },
        children: [
          new TextRun({
            text,
            font: "Calibri",
            size: opts.size ?? 20,
            bold: opts.bold,
            color: opts.color ?? "252525",
          }),
        ],
      }),
    ],
  });
}

function simpleTable(headers, rows, widths) {
  return new Table({
    width: { size: PAGE, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((h, i) =>
          cell(h, {
            width: widths[i],
            bold: true,
            color: "FFFFFF",
            fill: NAVY,
            size: 18,
            header: true,
          })
        ),
      }),
      ...rows.map((r) =>
        new TableRow({
          cantSplit: true,
          children: r.map((c, i) => cell(String(c), { width: widths[i] })),
        })
      ),
    ],
  });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Calibri", size: 22, color: "252525" },
      },
      heading1: {
        run: { font: "Calibri", size: 32, bold: true, color: NAVY },
        paragraph: { spacing: { before: 360, after: 160 }, keepNext: true },
      },
      heading2: {
        run: { font: "Calibri", size: 26, bold: true, color: NAVY },
        paragraph: { spacing: { before: 280, after: 120 }, keepNext: true },
      },
    },
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "\u2022",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 420, hanging: 240 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: ORANGE, space: 8 } },
              spacing: { after: 200 },
              children: [
                new TextRun({
                  text: "Clicks  ·  Customer app  ·  Store launch review",
                  font: "Calibri",
                  size: 18,
                  color: MUTED,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: { top: { style: BorderStyle.SINGLE, size: 6, color: LINE, space: 8 } },
              spacing: { before: 120 },
              children: [
                new TextRun({
                  text: "Internal  ·  13 November 2026  ·  Page ",
                  font: "Calibri",
                  size: 16,
                  color: MUTED,
                }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Calibri", size: 16, color: MUTED }),
                new TextRun({ text: " of ", font: "Calibri", size: 16, color: MUTED }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Calibri", size: 16, color: MUTED }),
              ],
            }),
          ],
        }),
      },
      children: [
        new Paragraph({
          spacing: { after: 80 },
          children: [
            new TextRun({
              text: "Do not put this build on the stores yet",
              font: "Calibri",
              size: 44,
              bold: true,
              color: NAVY,
            }),
          ],
        }),
        p("A plain-English review of the Clicks customer app before App Store and Play Store.", {
          size: 24,
          color: MUTED,
          after: 80,
        }),
        p("Written 13 November 2026. Based on the current laptop copy of the app, production settings, and the same-day quality check in Chrome.", {
          size: 20,
          color: MUTED,
          after: 200,
        }),

        h1("The short answer"),
        p("The core rescue journey works. A customer can log in, ask for help, wait, see the technician on a map, pay cash, and leave a rating. That path was proven on live production on 13 November."),
        p("That is not enough to publish. The file you would upload to Google Play cannot even be signed. The iPhone file would go out without working push notifications. If the first public version is bad, you have no way to force people onto a newer one. Five bugs that make the app look frozen or broken are still in this copy — they were fixed on a branch that was never merged."),
        p("You do not need in-app chat, a wallet, or dark mode to launch. You need a signed, honest, recallable build of the cash rescue product you already have."),

        h1("What a customer can do today"),
        p("If someone downloads this app against current production settings, they get:"),
        bullet("Log in with a Qatar phone number and password."),
        bullet("Press SOS, pick a car, confirm the pin on the map."),
        bullet("Wait while dispatch is found, then see the van on a live map with an ETA."),
        bullet("Pay cash to the technician and rate the job."),
        bullet("See past jobs in Activity, open a receipt from the server, manage cars, change language, contact support, and delete the account in Settings."),
        p("That is a real roadside product. Treat it as cash-only until card payment is actually turned on."),

        h2("Built, but switched off"),
        p("Membership packages and card payment (SkipCash) exist in the code. On production both are off. The membership tile is hidden in a store build. The Pay now button on this laptop copy is still shown, then fails. Screenshots that show card pay or membership while those switches are off will fail store review for being misleading."),
        p("There was a decision to launch with card and membership. Production does not match that decision. Until card is proven with a real payment webhook, a cash-only listing is the honest one."),

        h2("Built, but not proven on a real phone"),
        p("These exist in the app but were not fully tested on a device against production: book for later, garage / returning screens, actually collecting a cancel fee, opening a receipt PDF on the phone, sign-up with a real Qatar SIM, Arabic layout (the translations exist; the layout still leans left-to-right), logout on a phone, and two cars with live jobs at once."),

        h2("Not built — and that is fine for version 1"),
        p("Do not hold the launch for these. Competitors may have them. Clicks is a dispatch rescue app, not an insurer."),
        bullet("Chat with dispatch or the technician inside the app."),
        bullet("Share ETA with family."),
        bullet("Promo codes, a stored wallet, or saved cards."),
        bullet("Favourite locations, insurance, or picking a tow drop-off."),
        bullet("A queue number, surge pricing, dark mode, or larger text sizes."),
        bullet("Asking the customer to approve a quote before work starts."),
        bullet("Asking for a refund inside the app (finance does refunds on the admin side)."),

        h1("Fix these before you submit"),
        p("This is the real list. It is packaging, honesty, and a few bugs — not a new product."),

        simpleTable(
          ["What is wrong", "Why it matters", "What to do"],
          [
            [
              "After paying cash, a customer who had closed the app can stay stuck on “Job is in Progress”.",
              "Store reviews will say the app froze after payment.",
              "Merge the 13 November quality-fix branch and test on a real phone.",
            ],
            [
              "Logout can hang if Firebase is missing.",
              "People cannot leave the account screen.",
              "Same branch: do not wait forever on the push-token delete.",
            ],
            [
              "“Pay now” is shown while card payment is switched off.",
              "The button fails. Looks broken.",
              "Hide the button until card is really on.",
            ],
            [
              "Old bookings (late October / 11 November) take over Home.",
              "Reviewers and demo users land on a stale “booking confirmed” screen.",
              "Expire overdue bookings after a few hours. Clear the demo account.",
            ],
            [
              "Activity still shows 0 stars after a 5-star rating.",
              "Looks like the rating was lost.",
              "Refresh the list when the customer opens Activity.",
            ],
            [
              "Google Play signing files are missing on this machine.",
              "You cannot upload an Android app at all.",
              "Put the keystore on the build PC. Never commit it to git.",
            ],
            [
              "Firebase files for Android and iPhone are missing.",
              "Push notifications will not work. An iPhone in the background hears nothing when the van is assigned.",
              "Restore the real Google services files and build with the Firebase keys.",
            ],
            [
              "Privacy page talks about Android only. The public “delete account” web page is titled for the technician app.",
              "Apple and Google both require a real privacy page and a way to delete an account from the web as well as in the app.",
              "Rewrite the privacy page for Clicks on iPhone and Android. Make a customer deletion page. Say that deletion waits 30 days, then data is wiped.",
            ],
            [
              "Support phone in production is empty. The app falls back to +974 7091 9191 from an old receipt.",
              "After eight minutes of no van, the app tells the customer to call. A wrong number is a real incident.",
              "Put a number ops has actually called into production. Test it.",
            ],
            [
              "There is no minimum app version on the server.",
              "If the first public build is bad, you cannot force people to update.",
              "Have the next version ready. The day listings go live, set the minimum above the first version.",
            ],
          ],
          [2800, 3280, 3280]
        ),

        new Paragraph({ spacing: { after: 80 } }),

        h1("Business situations the app does not handle well"),
        p("The happy path is a product. The awkward path is still mostly a banner, a stamp, or “call us”."),

        h2("Nobody answers the SOS"),
        p("The system nags dispatch (about 2 minutes, 5 minutes, 8 minutes). It never closes the request by itself. That customer cannot raise a new SOS until someone cancels the old one. Quality check found an SOS from 8 November still sitting in the inbox. For a roadside brand, that is the worst hole."),

        h2("Busy night, no vans"),
        p("There is a “high demand” message and a call-us card. There is no queue position, no extra fee, and the app still lets the customer submit. Creating an SOS does not check that at least one technician is online. The November test assigned a technician by hand in admin after turning him online."),

        h2("After hours"),
        p("The public setting says 24/7. The hours helper still treats 2 a.m. Qatar as after hours. The customer is not told “we open again at …”. If nights are a forwarded phone rather than a staffed desk, say so in the app and on the listing."),

        h2("Cancel while the van is on the way"),
        p("The button changes to “Cancel (fee may apply)”. There is no reliable way to actually collect that fee. Threatening a fee and then chasing it offline causes fights. Either collect it in the app, or stop promising it."),

        h2("Refunds and membership"),
        p("Refunds are done in the finance admin, not by the customer. Deleting an account forfeits membership with no refund. If you turn membership on, the listing and in-app copy must say SOS, towing, and jump start are never included."),

        h2("Coverage"),
        p("Service area is a rectangle over Qatar, not the land shape. New York is correctly refused. A pin in the water or just over the border can still be accepted. The message is a small toast, not a clear “you are outside our area” screen."),

        h2("Unpaid old jobs"),
        p("An unpaid completed job no longer blocks a new SOS. That is a choice: always help, then show the debt. It is not a gap. Collecting the money is then an ops job, not an app job."),

        h1("How the app feels"),
        p("The rescue screens exist and look like a real on-demand app: once SOS starts, Home cannot fire a second one. Confirm location, busy banner, map, rating, empty “My Cars”, and offline retry are designed."),
        p("What still looks unfinished is names and stale screens:"),
        bullet("Cold start can show “Welcome,” with no name, or “N/A”."),
        bullet("Settings can show the words “null null” if the profile has not loaded."),
        bullet("Three different jobs once showed the same Job Id because the technician typed the same reference."),
        bullet("Dispatcher notes are shown as “Service Details”."),
        bullet("On one path the Call buttons do nothing."),
        p("Arabic translations are complete (every English string has Arabic). The layout is not: arrows still point right, some dates stay in English, and the font is Helvetica Neue, which has no Arabic cut. Permission pop-ups on iPhone will stay in English until Arabic is listed as a language in the iPhone project."),
        p("If location is denied, the app can fall back to a pin in Doha instead of a “open Settings” screen. Most errors are small toasts. Notifications are asked for at launch, before login — Apple prefers asking in context. Home copy says “emergency”. Apple is sensitive about using location for emergency services. Say “roadside assistance” on the store listing, not 911 language."),

        h1("Stores and legal"),
        p("Android package: com.roya.clicks_user. iPhone package: com.roya.clicksUser. That mismatch is normal; keep each ID consistent in Firebase and the store consoles."),
        p("The app asks for location while in use, internet, and notifications. It does not need background location (that is the technician app). It currently also asks for camera even though the customer cannot take photos in profile. Remove camera until you use it."),
        p("Google Play, from 31 August 2026, wants new apps and updates targeting Android 16. Confirm the Flutter SDK on the build PC does that. Crash reporting (Sentry) is not passed in the current Android build script — a crashing first version would be invisible."),
        p("Fill Play’s Data safety form for precise location (while using the app, shared with ops and the assigned technician), phone, name, email, user IDs, and device IDs for push. Do not claim photos, background location, or card data unless card pay is actually in the shipped file."),
        p("Give Apple a demo login against the live system. Do not leave that password in a file that sits in git."),

        h1("Suggested order", { pageBreak: true, before: 0 }),
        p("1. Merge the 13 November quality-fix branch. Prove it on a phone: payment freeze, logout, hide Pay now, old bookings, Activity stars."),
        p("2. Put Firebase files and the Play signing key on the build PC. Never commit them. Turn on iPhone push."),
        p("3. Rewrite privacy and the web delete-account page for Clicks customers. Set a real support number. Plan the next version so you can force-update if needed."),
        p("4. Publish as cash-only. After a real card payment is proven end to end, turn SkipCash on. Then membership, with clear copy that rescue jobs are not included."),
        p("5. After launch: close unanswered SOS automatically, match night staffing in the UI, collect or drop the cancel fee, tighten coverage to land, then polish Arabic layout and permission screens."),

        h1("Bottom line"),
        p("The customer app is a complete cash rescue product sitting in an incomplete store package. Chrome testing proved the journey. Missing signing files, missing push, an Android-only privacy page, a technician delete page, an empty support number, and an unmerged freeze-after-pay bug prove the listing is not that journey."),
        p("The decision that changes the answer is not “build chat”. It is: merge the quality fixes, restore push and signing, tell Apple and Google the truth about deletion and iPhone, hide Pay now until card is on, and put a human and a real number at the end of an unanswered SOS. Until then, keep this version off both stores."),
      ],
    },
  ],
});

const out = path.join(__dirname, "Customer app store launch gaps.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log("Wrote", out, buf.length, "bytes");
});
