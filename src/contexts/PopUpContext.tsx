import React, { createContext, useContext, useMemo, useState } from 'react'
import Popup from '../components/layout/Popup'

export type PopUpProps = {
  title: string,
  desc: string,
  onConfirm: () => void,
  onDisarm?: () => void
}

type PopUpContext = {
  open: (e: PopUpProps) => void
  close: () => void
}

const PopUpContext = createContext<PopUpContext | null>(null)

const PopUpText = ({ children } : { children: React.ReactNode}) => {
  const [data, setData] = useState<PopUpProps | null>(null)

  const close = () => setData(null)

  const value = useMemo(() => ({
    open: (e: PopUpProps) => setData({ ...e }),
    close
  }), [])

  const handleConfirm = () => {
    data?.onConfirm()
    close()
  }

  const handleDisarm = () => {
    data?.onDisarm?.()
    close()
  }

  return (
    <PopUpContext.Provider value={value}>
      {children}
      {
        data && <Popup data={data} handleDisarm={() => handleDisarm()} handleConfirm={() => handleConfirm()} />
      }
    </PopUpContext.Provider>
  )
}

export function usePopUp() {
  const context = useContext(PopUpContext)
  if (!context) throw new Error("usePopUp must be used inside <PopUpText>")
  return context;
}
export default PopUpText
