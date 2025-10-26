# Script Generation Feature

This feature allows users to upload structured JSON files extracted from PDFs and generate 90-second narration scripts using Google's Gemini AI.

## Features

### 🚀 Core Functionality
- **JSON Upload**: Upload structured JSON files with metadata, sections, tables, and figures
- **AI Script Generation**: Generate 90-second narration scripts using Gemini 2.5 API
- **Rich Text Editor**: Edit scripts with formatting options (bold, italic, underline)
- **Sentence Management**: Approve individual sentences for final script inclusion
- **Regeneration**: Generate new versions of scripts with different approaches
- **Export**: Download approved scripts as JSON files

### 🎯 User Workflow
1. Upload a JSON file extracted from PDF
2. Review the parsed content (metadata, sections, tables, figures)
3. Generate a 90-second narration script using Gemini AI
4. Edit the script using the rich text editor
5. Approve individual sentences
6. Regenerate if needed
7. Export the final approved script

## Technical Implementation

### Components
- **JsonUpload**: Handles file upload and JSON parsing with collapsible preview
- **ScriptEditor**: Rich text editor with sentence management and approval system
- **GeminiService**: API integration with Google Gemini AI

### State Management
```typescript
interface ScriptData {
  script: string
  sentences: [{ id: string, text: string, approved: boolean }]
  version: number
  generatedAt: string
}
```

### Export Format
```typescript
interface ExportData {
  paper_title: string
  final_script: string
  sentences: Array<{
    id: string
    text: string
    approved: boolean
  }>
  status: 'approved' | 'draft'
  version: number
}
```

## Setup Instructions

### 1. Environment Configuration
Add your Gemini API key to `.env.local`:
```bash
VITE_GEMINI_API_KEY=your_gemini_api_key_here
```

### 2. Get Gemini API Key
1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key to your environment file

### 3. Sample Data
A sample JSON file is available at `/public/sample-paper.json` for testing.

## Usage

### Navigation
Access the Script Generation feature via the sidebar navigation: **Script Generation**

### File Upload
- Only `.json` files are accepted
- Files should contain structured data with metadata, sections, tables, and figures
- Invalid JSON files will show an error message

### Script Generation
- Click "Generate Script" after uploading a valid JSON file
- The AI will create a 90-second narration script
- Scripts are automatically split into individual sentences

### Script Editing
- Use the rich text editor to modify the generated script
- Click on individual sentences to approve them
- Approved sentences are highlighted in green
- Use the toolbar for text formatting

### Export Options
- **Copy Script**: Copy the current script to clipboard
- **Export Script**: Download as JSON file with metadata
- **Regenerate**: Create a new version of the script

## API Integration

### Gemini Service
The `GeminiService` class handles all AI interactions:

```typescript
// Generate new script
const scriptData = await geminiService.generateScript(jsonData)

// Regenerate existing script
const newScript = await geminiService.regenerateScript(jsonData, currentScript)

// Export script data
const exportData = geminiService.exportScript(scriptData, paperTitle)
```

### Error Handling
- API key validation
- Network error handling
- User-friendly error messages
- Toast notifications for success/error states

## Styling

The feature follows the existing design system:
- Uses shadcn/ui components
- Consistent with Tailwind CSS theme
- Responsive design for all screen sizes
- Dark mode support

## Future Enhancements

- Audio playback of generated scripts
- Advanced sentence timing controls
- Multiple AI model options
- Script templates and presets
- Collaborative editing features
- Version history and comparison
