declare module 'html2pdf.js' {
  interface Html2PdfOptions {
    margin?: number | number[]
    filename?: string
    image?: {
      type?: 'jpeg' | 'png' | 'webp'
      quality?: number
    }
    html2canvas?: {
      scale?: number
      useCORS?: boolean
      letterRendering?: boolean
      logging?: boolean
      [key: string]: unknown
    }
    jsPDF?: {
      unit?: 'pt' | 'mm' | 'cm' | 'in'
      format?: 'a0' | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'a6' | 'letter' | 'legal'
      orientation?: 'portrait' | 'landscape'
      [key: string]: unknown
    }
    pagebreak?: {
      mode?: readonly string[] | string[]
      [key: string]: unknown
    }
  }

  interface Html2PdfInstance {
    set(options: Html2PdfOptions): Html2PdfInstance
    from(element: HTMLElement | string): Html2PdfInstance
    save(): Promise<void>
    output(type: string, options?: unknown): Promise<unknown>
    then(callback: (pdf: unknown) => void): Html2PdfInstance
  }

  function html2pdf(): Html2PdfInstance
  function html2pdf(element: HTMLElement, options?: Html2PdfOptions): Html2PdfInstance

  export default html2pdf
}
