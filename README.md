# Pustakam · പുസ്തകം

**Your book catalogue** — a calm, beautiful place to list and manage the books you own.

Pustakam is a static website: plain HTML, CSS and JavaScript, with no frameworks, no build step and no server. It runs entirely in the browser and can be hosted free on GitHub Pages.

## What it does

- Keep a catalogue of books with six fields: **Book name, Writer, Publisher, First edition year, This edition year, Category**.
- Add, edit and delete books in a slide-in drawer (a bottom sheet on phones), with friendly inline validation:
  - every field is required
  - years must be 4 digits, between 1400 and the current year
  - "This edition year" can't be earlier than "First edition year"
  - a warning if the same book name + writer + edition year is already listed
- Live search across book name, writer and publisher (works with Malayalam and any other language).
- **Your own categories** — there are no preset ones. Type any category when adding a book; next time it appears in the list to pick, along with how many books use it. Each new category gets its own spine colour automatically.
- Filter by category (a sidebar on laptops and desktops, scrollable chips on phones and tablets), sort by name, writer, publisher, either edition year or recently added, and switch between a **grid of book cards** and a **sortable list**.
- Designed for every screen: phones (bottom-sheet form, floating add button), tablets, laptops and large desktops (sidebar, sticky header, wider grid). The list view turns into compact cards whenever the space is too narrow for a table.
- A clean white theme by default, plus a dark theme you can switch to (your choice is remembered).
- **Backup on your device as a CSV file** — download a backup in one click and restore it later (merge or replace). The file opens cleanly in Excel or Google Sheets, Malayalam included. A small dot reminds you when there are changes not yet backed up.
- Undo for deletes, toast notifications, keyboard support (press <kbd>/</kbd> to search, <kbd>Esc</kbd> to close anything).

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, icons and the add/edit form |
| `style.css` | All styling, colours and themes |
| `script.js` | Storage, search, sorting, rendering, validation and backup |
| `README.md` | This guide |

## Deploy on GitHub Pages (free)

1. **Create a repository.** Sign in to [github.com](https://github.com), click **New** (or the **+** menu → *New repository*). Name it, for example, `pustakam`, keep it **Public**, and click **Create repository**.
2. **Upload the files.** On the new repository page click **uploading an existing file** (or **Add file → Upload files**). Drag in `index.html`, `style.css`, `script.js` and `README.md`. Make sure they sit at the top level of the repository, not inside a folder. Click **Commit changes**.
3. **Turn on Pages.** Go to **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose the **main** branch and the **/ (root)** folder, then click **Save**.
4. **Open your site.** After a minute or two the page shows your address:

   ```
   https://<your-username>.github.io/<repository-name>/
   ```

   For example `https://yourname.github.io/pustakam/`. Refresh the Settings → Pages screen if the link isn't there yet.

To update the site later, upload the changed files again (or edit them on GitHub) and Pages will republish automatically.

## Your data lives on this device

Books are saved in the browser's **localStorage** under the key `pustakam_v1`. That means:

- Your list is still there after refreshing, closing the browser or restarting the device.
- It is **only in that browser on that device**. A different browser, a different phone, or a private/incognito window will show an empty catalogue.
- Clearing your browser's site data will erase it.

If the browser blocks storage (some private modes do), Pustakam shows a notice at the top of the page and your changes will only last until you close the tab.

## Backing up (CSV file)

A backup is a **CSV file saved on your device**. It opens in Excel, Google Sheets, Numbers or LibreOffice, with Malayalam shown correctly.

**To back up:** **Backup → Download backup** (or **Download backup** in the sidebar on larger screens). A file such as `pustakam-backup-2026-10-24.csv` is saved to your Downloads folder. Each day's backup gets its own date, so older backups stay as they are.

**To restore:** **Backup → Restore from backup** and choose a CSV file.

- On a device with no books, the books are simply restored.
- If the device already has books, you choose **Merge** (add the books from the file and skip any already listed) or **Replace** (remove this device's list first).

**Backup reminder.** Pustakam never interrupts you. Instead, a small amber dot on the **Backup** button shows when there are changes that aren't in a backup yet. The Backup menu and the sidebar card say when you last backed up and how many changes there have been since.

**Moving to another phone or computer.** Download a backup on the old device, send the file to the new one (by email, a USB stick, a cloud drive or Nearby Share), open Pustakam there and use **Restore from backup**.

### What's in the file

| Column | What it holds |
| --- | --- |
| Book name, Writer, Publisher | The book's details |
| First edition year, This edition year | Four-digit years |
| Category | Your category name |
| Added on | When the book was added, so *Recently added* sorting survives a restore |
| ID | A unique code for each book, so merging never creates duplicates |

You can edit the file in a spreadsheet and restore it. You can also restore a list you typed yourself: only a **Book name** column is required. Common column names are recognised (for example *Title*, *Author*, *Genre*, *First edition*), and files saved with commas, semicolons or tabs all work. Rows without an ID are matched against your books by book name, writer and edition year when merging.


## Categories and their colours

Pustakam starts with **no categories**. In the add/edit form, the Category field works like this:

- **Type a new name** (e.g. `Travel` or `നോവൽ`) and choose *Create “…”*, or just save — the category is created with the book.
- **Next time**, click or tap the field to see every category you've used, with a book count, and pick one. Typing filters the list.
- Matching ignores capital letters, so typing `travel` later reuses `Travel` instead of creating a second one.
- A category disappears from the lists automatically once no book uses it.

Each new category takes the next colour from `CATEGORY_COLORS` near the top of `script.js`:

```js
const CATEGORY_COLORS = [
  '#8B5E83', // plum
  '#4F7A8A', // slate teal
  ...
];
```

Edit, add or reorder the hex values to change the palette. This colour is used for the book's spine, its category dot and its pill. Muted, medium-dark tones look best on both themes. Categories that already exist keep the colour they were given on this device. After restoring a backup on a new device, colours are handed out again in palette order.

## Changing the accent colour

All colours are CSS custom properties at the top of `style.css`:

```css
:root {
  --accent: #2F5D50;        /* main accent (buttons, selected filter, focus ring) */
  --accent-hover: #264C41;  /* a little darker, for hover */
  --accent-tint: #EAF1ED;   /* very light wash, for hover backgrounds */
  --accent-tint-strong: #D6E5DD;
  --terracotta: #C2603E;    /* secondary accent: highlights and delete */
  ...
}
```

Change `--accent` (and its hover and tint shades to match). The dark theme has its own values in the `:root[data-theme="dark"]` block just below — use a slightly brighter version of the same colour there. Background, card, text and border colours are in the same place (`--bg`, `--surface`, `--ink`, `--muted`, `--border`).

The favicon is drawn in `index.html` (the `<link rel="icon">` line); its colours are the `%23…` hex values (`%23` means `#`).

## Browser support

Any current version of Chrome, Edge, Firefox or Safari, on desktop or mobile.
