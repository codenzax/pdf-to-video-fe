import * as pdfjsLib from 'pdfjs-dist'

// Configure PDF.js worker to use local file
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export interface ParsedPdfData {
  text: string
  pages: number
  info?: any
}

export class PdfProcessingService {
  /**
   * Parse PDF file and extract text content using pdfjs-dist
   */
  static async parsePdf(file: File): Promise<ParsedPdfData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target?.result as ArrayBuffer
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
          
          let fullText = ''
          const numPages = pdf.numPages
          
          // Extract text from all pages
          for (let pageNum = 1; pageNum <= numPages; pageNum++) {
            const page = await pdf.getPage(pageNum)
            const textContent = await page.getTextContent()
            const pageText = textContent.items
              .map((item: any) => item.str)
              .join(' ')
            fullText += pageText + '\n'
          }
          
          resolve({
            text: fullText.trim(),
            pages: numPages,
            info: {
              title: (pdf as any).info?.Title || '',
              author: (pdf as any).info?.Author || '',
              subject: (pdf as any).info?.Subject || '',
              creator: (pdf as any).info?.Creator || ''
            }
          })
        } catch (error) {
          reject(error)
        }
      }
      
      reader.onerror = () => reject(new Error('Failed to read PDF file'))
      reader.readAsArrayBuffer(file)
    })
  }

  /**
   * Process a single PDF file
   */
  static async processPdf(file: File): Promise<ParsedPdfData> {
    return await this.parsePdf(file)
  }
}
