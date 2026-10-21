This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## TD Print History

Open **Print Records → TD Print History** to record printed TD numbers. Enter a location once, choose the printed date, paste the list, review the preview, and select **Save printed batch**. Numbered lists, the optional “The TD Numbers for … are:” heading, and comma-separated numbers are supported. TD numbers retain leading zeros. Repeated numbers within one batch are removed; the same TD can appear in later batches to record reprints. Search history by TD number or location and select **View TDs** to see a batch.

This is a record of printing already performed; saving does not send documents to a printer. Print batches use their own database tables, independent of property and delinquency records.

In a saved batch, tap a TD number to copy it. Click the small circle next to it to save a green printed checkmark; click again to undo. Marks are saved per entry in that batch and remain after reloading. Existing entries start unmarked. Copying a TD does not change its printed mark.

Select **Add note** beside the printed count to leave an optional note for a batch. Notes are saved across reloads and stay hidden after saving; a green dot on the note icon indicates a saved note. Select the icon to view or edit it, and select it again to hide the editor without losing your draft. Clear the text and save to remove the note and its indicator. Notes support up to 1,000 characters and are stored in `td_print_batches.note`.

When updating an existing installation, stop the app, run `npm run db:push` and `npm run db:generate`, rebuild with `npm run build`, then restart the app. This feature uses `td_print_batches` and `td_print_entries`; the saved mark is stored in `td_print_entries.isPrinted` and defaults to false. Existing property and delinquency data is preserved. Apply the schema to the database used by the deployed app too.

Run parser and validation tests with `npm test`. To exercise the API against a running local development server and the database configured in `.env`, set `TD_PRINT_TEST_URL` (for example, `http://localhost:3001`) and run `npm run test:td-history:api`. This test creates uniquely labelled temporary batches and removes them and their audit events afterward.

## File Manager

Open **File Manager** in the side menu, above **eTRACS**, to upload copies of PDF, Word (`.doc`, `.docx`), and Excel (`.xls`, `.xlsx`, `.csv`) files. Upload several files at once, up to 50 MB each. Create folders, rename and move files, search by name, and filter by file type. Click a file name to preview a PDF in the browser or open Word/Excel files in the matching desktop app. The three-dot menu also offers **Open in Word** or **Open in Excel**, plus **Download**. Duplicate filenames are stored as separate copies.

Desktop opening uses Microsoft's [Office URI schemes](https://learn.microsoft.com/en-us/office/client-developer/office-uri-schemes), which require Word or Excel to be installed on the computer using the browser. Allow the browser's prompt to open the app. Files open for viewing; Office edits do not automatically update LedgerDex. Save an edited copy and upload it when needed. If an app does not open, use **Download**. Run `npm run test:file-open` to check file-type routing and link encoding.

**Trash** keeps removed files until you restore them. There is no permanent file deletion action. A folder can only be deleted when it contains no files, including files in Trash.

Set `FILE_MANAGER_DIR` in `.env` to an **absolute path outside `.next`**, such as `D:/PRJ-2/ledgerdex/uploads/file-manager`. Development and Start LedgerDex must use the same path so rebuilds do not remove uploads. Docker Compose uses `/app/uploads/file-manager` in its existing uploads volume. Back up both this directory and the database: `file_folders` and `managed_files` contain the folder organization and filenames. This library is shared by users of this LedgerDex installation and is separate from PDF extraction and property attachments.

For an existing installation, run `npm run db:push` and `npm run db:generate`, then rebuild and restart. The feature adds two tables without changing existing records. Run `npm run test:file-manager:api` with `FILE_MANAGER_TEST_URL=http://localhost:3000` to exercise uploads, organization, recovery, and download integrity; the test removes only its own temporary files and records.

## Open eTRACS

The **eTRACS** button at the bottom of the side menu, above **Collapse**, opens the installed desktop application on the computer using the browser. Set it up once for each Windows user on that computer:

```powershell
powershell -NoProfile -File .\scripts\setup-etracs.ps1
```

The default launcher is `C:\etracs255-platform\etracs25_platform.bat`. For a different installation folder, pass `-EtracsLauncher 'C:\path\to\etracs25_platform.bat'`. No administrator access is needed. Allow the browser's prompt to open the application when clicking the button. Other PCs need their own eTRACS installation and setup. Both development and Start LedgerDex use the same button.

The setup registers a fixed `ledgerdex-etracs:` handler for the current Windows user, with the working directory required by eTRACS. It does not pass link contents to the application or shell. See Microsoft's [URI registration documentation](https://learn.microsoft.com/en-us/previous-versions/windows/internet-explorer/ie-developer/platform-apis/aa767914(v=vs.85)).

## Appearance

LedgerDex starts in light mode when there is no saved preference. Use the sun/moon button in the header to change modes; your choice is remembered when you reopen the app in the same browser at the same address. The desktop shortcut (`localhost:3100`) and development page (`localhost:3000`) keep separate preferences.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
