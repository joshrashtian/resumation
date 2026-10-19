import React, { createContext } from 'react'

type DocumentContext {
  doc: any;
}

const DocumentContext=createContext({})

const DocumentContextProvider = () => {
  return (
    <div>DocumentContextProvider</div>
  )
}

export default DocumentContextProvider
