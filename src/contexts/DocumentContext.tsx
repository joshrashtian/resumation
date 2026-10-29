import { createContext } from 'react'

type DocumentContext = {
  doc: any;
}

export const DocumentContext = createContext<DocumentContext | null>(null)

const DocumentContextProvider = () => {
  return (
    <div>DocumentContextProvider</div>
  )
}

export default DocumentContextProvider
