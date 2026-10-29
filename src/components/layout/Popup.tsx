import { PopUpProps } from '../../contexts/PopUpContext'
import styles from "./Popup.module.css"
const Popup = ({ data, handleDisarm, handleConfirm } : { data: PopUpProps, handleConfirm: () => void, handleDisarm: () => void}) => {
  return (
        <div className={styles.backdrop} onClick={handleDisarm}>
          <div
            className={styles.popup}
            role="dialog"
            aria-modal="true"
            aria-labelledby="popup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="popup-title">{data.title}</h2>
            <p>{data.desc}</p>
            <div className={styles.actions}>
              <button onClick={handleDisarm}>Cancel</button>
              <button className={styles.confirm} onClick={handleConfirm}>Confirm</button>
            </div>
          </div>
        </div>
  )
}

export default Popup
