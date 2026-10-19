import ProjectPicker from "../components/ProjectPicker";
import styles from "./HomePage.module.css";

function HomePage() {
  return (
    <main className={styles.home} data-tauri-drag-region>
      <h1>Resumation</h1>
      <p>An editor suite to <u>optimize</u> your resume. </p>
      <ProjectPicker />
    </main>
  );
}

export default HomePage;
