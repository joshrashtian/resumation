import { FormEvent, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Link, useNavigate } from "react-router";
import { FaRegFolder } from "react-icons/fa6";
import styles from "./ProjectPicker.module.css";

export const editorPath = (project: string) => `/editor/${encodeURIComponent(project)}`;

// Lists the project folders in ResumationData and creates new ones.
const ProjectPicker = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    invoke<string[]>("list_projects")
      .then(setProjects)
      .catch((err) => setError(String(err)));
  }, []);

  async function createProject(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await invoke<string>("create_project", { name });
      navigate(editorPath(created));
    } catch (err) {
      setError(
        String(err) === "invalid project name"
          ? "Project names can't contain slashes or start with a dot."
          : String(err),
      );
    }
  }

  return (
    <div className={styles.picker}>
      {projects && projects.length > 0 && (
        <ul className={styles.projects}>
          {projects.map((name) => (
            <li key={name}>
              <Link to={editorPath(name)}>
                <FaRegFolder />
                <span>{name}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {projects?.length === 0 && <p className={styles.empty}>No projects yet.</p>}

      <form className={styles.create} onSubmit={createProject}>
        <input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
            setError(null);
          }}
          placeholder="New project name"
          aria-label="New project name"
        />
        <button type="submit" disabled={!newName.trim()}>
          Create
        </button>
      </form>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
};

export default ProjectPicker;
