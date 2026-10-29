import { Settings, useSettings } from "../lib/settings";

const PAGE_LIMITS: { value: Settings["pageLimit"]; label: string }[] = [
  { value: 0, label: "No limit" },
  { value: 1, label: "1 page" },
  { value: 2, label: "2 pages" },
];

function SettingsPage() {
  const [settings, setSettings] = useSettings();

  return (
    <div className="settings">
      <h1>Settings</h1>
      <label>
        Page limit{" "}
        <select
          value={settings.pageLimit}
          onChange={(e) => setSettings({ ...settings, pageLimit: Number(e.target.value) as Settings["pageLimit"] })}
        >
          {PAGE_LIMITS.map((limit) => (
            <option key={limit.value} value={limit.value}>
              {limit.label}
            </option>
          ))}
        </select>
      </label>
      <p>
        Stops the resume from growing past this many pages. Imported Word files use their own page size and
        margins; new resumes use US Letter with 1-inch margins.
      </p>
      <label>
        <input
          type="checkbox"
          checked={settings.transparency}
          onChange={(e) => setSettings({ ...settings, transparency: e.target.checked })}
        />{" "}
        Transparent window
      </label>
      <p>Turn off to give the window a solid background instead of see-through glass.</p>
    </div>
  );
}

export default SettingsPage;
