import { FormEvent, useState } from "react";
import styles from "./NewFileInput.module.css";

type NewFileInputProps = {
  placeholder: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

// Inline name field for creating a file: ↵ creates, Esc cancels.
const NewFileInput = ({ placeholder, onSubmit, onCancel }: NewFileInputProps) => {
  const [name, setName] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim()) onSubmit(name.trim());
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <input
        autoFocus
        value={name}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
        onBlur={() => !name.trim() && onCancel()}
      />
    </form>
  );
};

export default NewFileInput;
