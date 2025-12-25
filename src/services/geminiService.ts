import { GoogleGenerativeAI } from '@google/generative-ai'

export interface JsonData {
  metadata?: {
    title?: string
    authors?: string[] | Array<{ firstName: string; lastName: string; email?: string; affiliation?: string }>
    abstract?: string
    keywords?: string[]
  }
  sections?: Array<{
    title: string
    content: string
    level: number
  }> | Record<string, any> // Allow both array and object formats
  tables?: Array<{
    caption: string
    data: any
  }>
  figures?: Array<{
    caption: string
    description: string
    category?: 'methodology' | 'results' // Categorization of figure
  }>
  images?: Array<{
    caption: string
    description: string
    category?: 'methodology' | 'results' // Categorization of figure
  }>
}

export interface SentenceVisual {
  videoId?: string
  videoUrl?: string
  thumbnailUrl?: string
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'approved' | 'rejected'
  approved: boolean
  uploaded?: boolean // true if user uploaded custom video
  mode?: 'gpt' | 'unsplash' // Generation mode
  imageUrl?: string // For GPT static mode - stores the background image (no text)
  videoBase64?: string // Base64 encoded video (for blob URL conversion)
  imageBase64?: string // Base64 encoded image (for blob URL conversion)
  transitionType?: 'fade' | 'slide' | 'dissolve' | 'none' // Transition to next scene
  // Subtitle settings (for GPT static mode - HTML overlay)
  subtitleSettings?: {
    yPosition: number // Y position in pixels (0-1080)
    fontSize: number // Font size in pixels
    zoom: number // Subtitle zoom level (0.5 - 2.0)
  }
  subtitleText?: string // Editable subtitle text (synchronized with video/audio generation)
  presentationText?: string[] // Bullet points to display centered in video (baked into video)
  prompt?: string // Image/video generation prompt (editable by user)
  // Unsplash image support
  imageSource?: 'ai' | 'unsplash' // Image source: AI generation or Unsplash
  unsplashImageData?: {
    id: string
    url: string
    photographer: string
    photographerUsername: string
    photographerUrl: string
    unsplashUrl: string
    description: string | null
  } // Unsplash image metadata with attribution
}

export interface SentenceAudio {
  audioUrl?: string
  audioBase64?: string
  duration?: number
  approved: boolean
  isCustom: boolean // true if uploaded by user
  voiceId?: string
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'approved' | 'rejected'
}

export interface BackgroundMusic {
  audioUrl?: string
  audioBase64?: string
  duration?: number
  prompt?: string
  seed?: number
  approved: boolean
  isCustom: boolean // true if uploaded by user
  license?: {
    provider: 'stability' | 'custom'
    licenseType?: string
    attribution?: string
    usageRights?: string
  }
  volume?: number // 0.0 - 1.0, default 0.3
  trimStart?: number // Start time in seconds
  trimEnd?: number // End time in seconds
  status?: 'pending' | 'generating' | 'completed' | 'failed' | 'approved' | 'rejected'
}

export interface Sentence {
  id: string
  text: string // Speaking use (subtitles)
  presentation_text?: string[] // Viewing use (slide text) - array of bullet points
  approved: boolean
  startTime?: number
  endTime?: number
  visual?: SentenceVisual
  audio?: SentenceAudio
}

export interface FinalVideo {
  videoUrl?: string
  videoBase64: string
  duration: number
  exportedAt?: string
  isExported?: boolean
}

export interface ScriptData {
  id?: string // Optional ID for tracking
  script: string
  sentences: Sentence[]
  version: number
  generatedAt: string
  backgroundMusic?: BackgroundMusic // One background music for all sentences
  finalVideo?: FinalVideo // Final assembled and exported video
}

export interface ExportData {
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

class GeminiService {
  private genAI: GoogleGenerativeAI | null = null
  private apiKey: string | null = null

  constructor() {
    this.apiKey = import.meta.env.VITE_GEMINI_API_KEY || null
    if (this.apiKey) {
      this.genAI = new GoogleGenerativeAI(this.apiKey)
    }
  }

  private validateApiKey(): boolean {
    if (!this.apiKey) {
      throw new Error('Gemini API key not found. Please set VITE_GEMINI_API_KEY in your environment variables.')
    }
    return true
  }

  private generateSentenceId(index: number): string {
    return `sentence_${index + 1}`
  }

  private splitIntoSentences(text: string): Sentence[] {
    // Split into proper sentences first
    let sentences = text
      .split(/(?<=[.!?])\s+(?=[A-Z])/) // Split on sentence boundaries but keep punctuation
      .map(s => s.trim())
      .filter(s => s.length > 20) // Filter out very short fragments
    
    // If no sentences found with standard splitting, try alternative methods
    if (sentences.length === 0) {
      // Try splitting by periods, exclamation marks, and question marks
      sentences = text
        .split(/[.!?]+\s*/)
        .map(s => s.trim())
        .filter(s => s.length > 20)
    }
    
    // If still no sentences, split by words as last resort
    if (sentences.length === 0) {
      const words = text.split(/\s+/).filter(w => w.length > 0)
      if (words.length > 0) {
        const wordsPerSentence = Math.ceil(words.length / 15)
        sentences = []
        for (let i = 0; i < 15 && i * wordsPerSentence < words.length; i++) {
          const start = i * wordsPerSentence
          const end = Math.min(start + wordsPerSentence, words.length)
          const sentence = words.slice(start, end).join(' ')
          if (sentence.length > 0) {
            sentences.push(sentence + (i < 14 ? '.' : ''))
          }
        }
      }
    }

    // Always ensure we have exactly 15 sentences
    const targetSentences = 15
    const finalSentences: string[] = []
    
    if (sentences.length >= targetSentences) {
      // If we have 15 or more sentences, take the first 15 unique ones
      const seen = new Set<string>()
      for (const sentence of sentences) {
        const normalized = sentence.toLowerCase().trim()
        if (!seen.has(normalized) && finalSentences.length < targetSentences) {
          seen.add(normalized)
          finalSentences.push(sentence)
        }
        if (finalSentences.length >= targetSentences) break
      }
    } else if (sentences.length > 0) {
      // If we have fewer than 15 sentences, distribute content more intelligently
      // Try to split longer sentences or combine shorter ones to reach 15
      const totalWords = sentences.join(' ').split(/\s+/).length
      const targetWordsPerSentence = Math.ceil(totalWords / targetSentences)
      
      let wordIndex = 0
      const allWords = sentences.join(' ').split(/\s+/)
      
      for (let i = 0; i < targetSentences && wordIndex < allWords.length; i++) {
        const wordsForThisSentence: string[] = []
        const targetWords = i === targetSentences - 1 
          ? allWords.length - wordIndex // Last sentence gets remaining words
          : targetWordsPerSentence
        
        for (let j = 0; j < targetWords && wordIndex < allWords.length; j++) {
          wordsForThisSentence.push(allWords[wordIndex])
          wordIndex++
        }
        
        if (wordsForThisSentence.length > 0) {
          const sentence = wordsForThisSentence.join(' ')
          // Only add if it's unique
          const normalized = sentence.toLowerCase().trim()
          if (!finalSentences.some(s => s.toLowerCase().trim() === normalized)) {
            finalSentences.push(sentence + (i < targetSentences - 1 ? '.' : ''))
          }
        }
      }
    }

    // If we still don't have 15 unique sentences, we need to handle this case
    // This should rarely happen if the AI generates proper content, but we need a fallback
    if (finalSentences.length < targetSentences) {
      console.warn(`Warning: Only ${finalSentences.length} unique sentences found. Expected ${targetSentences}.`)
      // Try to split the last few sentences more granularly to create more content
      if (finalSentences.length > 0) {
        const lastSentence = finalSentences[finalSentences.length - 1]
        const words = lastSentence.split(/\s+/)
        if (words.length > 10) {
          // Split the last sentence into smaller parts
          const wordsPerPart = Math.ceil(words.length / (targetSentences - finalSentences.length + 1))
          for (let i = 0; i < words.length && finalSentences.length < targetSentences; i += wordsPerPart) {
            const part = words.slice(i, i + wordsPerPart).join(' ')
            if (part.trim().length > 0) {
              const normalized = part.toLowerCase().trim()
              if (!finalSentences.some(s => s.toLowerCase().trim() === normalized)) {
                finalSentences.push(part + '.')
              }
            }
          }
        }
      }
      
      // Final fallback: add numbered placeholders only if absolutely necessary
      while (finalSentences.length < targetSentences) {
        const placeholder = `[Content segment ${finalSentences.length + 1} - requires regeneration]`
        finalSentences.push(placeholder)
      }
    }

    // Final validation: ensure all sentences are unique
    const uniqueSentences: string[] = []
    const seenNormalized = new Set<string>()
    
    for (const sentence of finalSentences.slice(0, targetSentences)) {
      const normalized = sentence.toLowerCase().trim()
      if (!seenNormalized.has(normalized)) {
        seenNormalized.add(normalized)
        uniqueSentences.push(sentence)
      }
    }
    
    // If we lost sentences due to duplicates, pad with numbered placeholders
    while (uniqueSentences.length < targetSentences) {
      uniqueSentences.push(`Additional content segment ${uniqueSentences.length + 1}.`)
    }

    return uniqueSentences.slice(0, targetSentences).map((text, index) => ({
      id: this.generateSentenceId(index),
      text: text.trim(),
      approved: false,
      startTime: index * 6, // 6 seconds per sentence for 90 seconds total
      endTime: (index + 1) * 6
    }))
  }

  async generate3Scripts(jsonData: JsonData): Promise<ScriptData[]> {
    this.validateApiKey()

    if (!this.genAI) {
      throw new Error('Gemini AI not initialized')
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      // Prepare categorized images for context
      const methodologyImages = jsonData.images?.filter(img => img.category === 'methodology') || []
      const resultsImages = jsonData.images?.filter(img => img.category === 'results') || []
      // Removed unused figures variable

      const prompt = `You are a professional narration scriptwriter specializing in converting structured research data into short, natural, spoken-style scripts for video or audio narration.

You will receive a JSON object containing:
• metadata: title, authors, keywords, etc.
• sections: abstract, introduction, background, methodology, discussion, results, conclusion
• tables: data tables with key statistics and findings
• images/figures: categorized into methodology (research methods, experimental setup, procedures) and results (findings, outcomes, conclusions)

CRITICAL REQUIREMENT: You MUST extract and use information from ALL sections provided:
1. ABSTRACT: Extract the main research question, key findings, and conclusions
2. INTRODUCTION: Extract the problem statement, research objectives, and significance
3. BACKGROUND: Extract relevant context, literature review insights, and theoretical framework
4. METHODOLOGY: Extract research design, methods, procedures, algorithms, experimental setup, and data collection approaches
5. RESULTS: Extract ALL findings, statistics, performance metrics, comparisons, and quantitative outcomes
6. DISCUSSION: Extract interpretations, implications, limitations, and connections to existing research
7. CONCLUSION: Extract main contributions, future work, and overall impact

IMPORTANT: The images/figures are categorized to help you create more authentic and detailed scripts:
- METHODOLOGY images: Use these when describing research methods, experimental setup, procedures, algorithms, or data collection processes
- RESULTS images: Use these when describing findings, outcomes, performance metrics, or experimental results

CRITICAL FIGURE USAGE RULES:
- DO describe what the figure shows (e.g., "The experimental setup demonstrates...", "The results reveal a 15% improvement...", "Performance metrics show...")
- DO use the data points, insights, and descriptions from figures naturally in your narrative
- DO NOT mention "Figure 1", "Figure 2", "Fig. 1", "Fig. 2", or any figure numbers
- DO NOT say "as shown in Figure X", "see Figure X", "Figure X shows", or any similar references
- Instead, naturally describe the visual content and findings without referencing figure numbers
- Integrate the figure information seamlessly into the narrative as if describing what was observed or measured

Your job is to analyze this JSON and produce THREE DIFFERENT, distinct variations of a refined, engaging 90-second narration script (exactly 15 sentences, TOTAL word count between 275-350 words for the entire script).

FOR EACH SENTENCE, you must generate TWO separate outputs:

1. SCRIPT TEXT (Speaking use / Subtitles): Natural, spoken language for narration/subtitles
   - Creates a compelling narrative that makes readers want to explore the full research
   - MUST extract and incorporate information from ALL sections (abstract, introduction, background, methodology, results, discussion, conclusion)
   - MUST use specific details, statistics, methodologies, and results from EACH section
   - MUST reference tables when they contain relevant data or statistics
   - References and incorporates information from categorized images/figures when relevant
   - When discussing methodology, use insights from methodology images/figures to add authenticity - describe what they show naturally (e.g., "The experimental setup includes...", "The methodology demonstrates...") WITHOUT mentioning figure numbers
   - When discussing results, use insights from results images/figures to provide concrete evidence - describe the findings naturally (e.g., "The results reveal...", "Performance metrics show...") WITHOUT mentioning figure numbers
   - NEVER mention "Figure 1", "Figure 2", "Fig. 1", "Fig. 2", or any figure numbers in the script
   - Builds intellectual curiosity and demonstrates the depth of the study
   - Avoids generic phrases like "this video" or superficial summaries
   - Each sentence must contain substantial, specific information extracted from the actual section content
   - Creates a sophisticated narrative that reflects the academic rigor of the work
   - Uses precise terminology and findings that showcase the study's contributions
   - STRUCTURE: Must have a strong opening hook, progressive body development, and impactful closing
   - NARRATIVE ARC: Build from problem identification through methodology to results and implications
   - SENTENCE LENGTH: Keep each sentence between 15-25 words (normal range). Avoid sentences exceeding 30 words. Maintain consistent length across sentences.
   - CRITICAL: Each of the 15 sentences must be UNIQUE and DISTINCT - never repeat the same sentence or similar phrasing
   - CRITICAL: Do NOT skip any section - ensure information from all 7 sections is represented in the script
   - CRITICAL: Total word count for entire script must be between 275-350 words

2. PRESENTATION TEXT (Viewing use / Slide text): 2-4 concise bullet points summarizing key points for presentation slides
   - Extract the core content and main ideas from each sentence
   - Format as bullet points (use "- " prefix for each point)
   - Keep each bullet point concise (10-15 words maximum)
   - Focus on key concepts, findings, or implications
   - Use clear, direct language suitable for visual presentation
   - Each sentence should have 2-4 bullet points

🎯 PERFECT SCRIPT STRUCTURE (15 Sentences Total):

**OPENING (Sentences 1-3): THE HOOK & CONTEXT**
- Sentence 1: STRONG OPENING HOOK - Start with a compelling question, surprising fact, or bold statement that immediately captures attention. Reference the paper title and create intellectual curiosity. Examples: "What if [key problem] could be solved through [innovative approach]?" or "[Surprising statistic/claim] - this groundbreaking research by [authors] challenges our understanding of [field]."
- Sentence 2: ESTABLISH CREDIBILITY & CONTEXT - Mention authors (full names if available) and their affiliation/institution. Set the research context, define the problem space, and explain why this research matters. Connect to the broader field or real-world implications.
- Sentence 3: RESEARCH OBJECTIVE - Clearly state what this study aims to achieve. Use the introduction and abstract to identify the main research question or objective. Frame it as an important question that needs answering.

**BODY - BACKGROUND & METHODOLOGY (Sentences 4-7): THE FOUNDATION**
- Sentence 4: BACKGROUND CONTEXT - Provide necessary context from the background section. Explain existing knowledge, gaps in the field, or why this research is needed. Reference literature insights or theoretical framework.
- Sentence 5: RESEARCH MOTIVATION - Explain what drove this research. What problem does it address? What limitations of previous work does it overcome? Use introduction and background sections.
- Sentence 6: METHODOLOGY OVERVIEW - Describe the research approach, methods, or experimental design from the methodology section. Be specific about techniques, datasets, or procedures used. Reference methodology images naturally.
- Sentence 7: METHODOLOGICAL DETAILS - Provide key methodological specifics: sample sizes, algorithms, experimental setup, data collection procedures, or analytical techniques. Reference methodology images to add authenticity.

**BODY - RESULTS & FINDINGS (Sentences 8-11): THE EVIDENCE**
- Sentence 8: KEY FINDING #1 - Present the first major finding or result with specific statistics, metrics, or data points. Use actual numbers from results section or tables. Reference results images naturally.
- Sentence 9: KEY FINDING #2 - Present another significant finding with quantitative data. Include comparisons, improvements, or performance metrics. Use tables if relevant.
- Sentence 10: COMPARATIVE ANALYSIS - Discuss how the results compare to previous work, benchmarks, or expectations. Include statistical significance, effect sizes, or performance improvements.
- Sentence 11: ADDITIONAL INSIGHTS - Present nuanced findings, unexpected results, or interesting patterns. Use discussion section to interpret what these results mean.

**BODY - DISCUSSION & IMPLICATIONS (Sentences 12-13): THE MEANING**
- Sentence 12: INTERPRETATION - Explain what the findings mean from the discussion section. Discuss implications, why these results matter, or what they reveal about the research question.
- Sentence 13: BROADER IMPACT - Connect findings to broader implications: field impact, practical applications, theoretical contributions, or real-world significance. Use discussion and conclusion sections.

**CLOSING (Sentences 14-15): THE IMPACT**
- Sentence 14: MAJOR CONTRIBUTIONS - Highlight the study's most significant contributions to the field. What does this research add that wasn't known before? What are the key takeaways? Use conclusion section.
- Sentence 15: POWERFUL CONCLUSION - Create a memorable closing that explains why this research matters and motivates exploration of the full study. End with impact, future possibilities, or the broader significance. Make it resonate emotionally and intellectually. DO NOT end with just data - end with meaning and inspiration.

🎯 QUALITY STANDARDS:
• SENTENCE LENGTH: Each sentence should be 15-25 words (normal range). Avoid sentences exceeding 30 words. Maintain consistent length for better narration flow.
• TOTAL WORD COUNT: ENTIRE script must be 275-350 words across all 15 sentences.
• OPENING QUALITY: First sentence MUST be a compelling hook that grabs attention immediately. Never start with generic phrases like "This research" or "In this paper."
• TRANSITIONS: Use smooth connecting phrases between sentences (e.g., "Building on this foundation...", "These findings reveal...", "Furthermore...", "Critically...").
• SPECIFICITY: Include actual numbers, statistics, percentages, sample sizes, and specific details from the research. Avoid vague language.
• VARIETY: Use varied sentence structures and vocabulary. Avoid repetition of phrases or concepts.
• INFORMATION COMPLETENESS: Extract from ALL 7 sections (abstract, introduction, background, methodology, results, discussion, conclusion). Balance information density across sentences.
• PROFESSIONAL TONE: Write in a sophisticated, academic yet accessible tone. Sound like a professional narrator, not generic AI.
• FIGURE USAGE: Reference methodology and results images naturally without mentioning figure numbers. Describe what they show as part of the narrative.

Paper Data:
${JSON.stringify(jsonData, null, 2)}

Categorized Images/Figures:
${methodologyImages.length > 0 ? `\nMETHODOLOGY IMAGES (${methodologyImages.length}):\n${methodologyImages.map((img, idx) => `- ${img.caption || `Figure ${idx + 1}`}: ${img.description}`).join('\n')}` : 'No methodology images'}
${resultsImages.length > 0 ? `\nRESULTS IMAGES (${resultsImages.length}):\n${resultsImages.map((img, idx) => `- ${img.caption || `Figure ${idx + 1}`}: ${img.description}`).join('\n')}` : 'No results images'}

CRITICAL REQUIREMENTS:
1. Generate EXACTLY 15 UNIQUE sentences - each sentence must be completely different from all others
2. Never repeat the same sentence, even with slight variations
3. Each sentence should cover different aspects, findings, or implications from the research
4. ABSOLUTE REQUIREMENT: NEVER mention "Figure 1", "Figure 2", "Fig. 1", "Fig. 2", or any figure numbers. Instead, describe what the figures show naturally (e.g., "The experimental setup demonstrates...", "The results reveal a 15% improvement...", "Performance metrics show...") without referencing figure numbers.
5. Generate THREE DISTINCTLY DIFFERENT script variations. Each script should:
   - Have a different opening approach/hook (different hook styles: question vs. statement vs. statistic)
   - Emphasize different aspects of the research
   - Use varied narrative styles
   - Present information in different orders/structures
6. OPENING PERFECTION: The first sentence of EACH script must be a compelling hook. Avoid generic starts. Make it engaging and attention-grabbing.
7. CLOSING PERFECTION: The final sentence of EACH script must be powerful, memorable, and inspiring. End with impact and meaning, not just data.
8. STRUCTURE ADHERENCE: Follow the exact structure outlined above (Opening 1-3, Background/Methodology 4-7, Results 8-11, Discussion 12-13, Closing 14-15) for each of the 3 scripts.

ABSOLUTE REQUIREMENT: NEVER mention "Figure 1", "Figure 2", "Fig. 1", "Fig. 2", or any figure numbers in any of the scripts. Instead, describe what the figures show naturally (e.g., "The experimental setup demonstrates...", "The results reveal a 15% improvement...", "Performance metrics show...") without referencing figure numbers.

Format your response EXACTLY as follows (no other text):

SCRIPT 1:
SCENE 1:
SCRIPT: [Sentence 1 text for speaking/subtitles]
PRESENTATION:
- [Bullet point 1 for slide]
- [Bullet point 2 for slide]
- [Bullet point 3 for slide]

SCENE 2:
SCRIPT: [Sentence 2 text for speaking/subtitles]
PRESENTATION:
- [Bullet point 1 for slide]
- [Bullet point 2 for slide]
- [Bullet point 3 for slide]

[Continue for all 15 scenes...]

SCRIPT 2:
SCENE 1:
SCRIPT: [Sentence 1 text for speaking/subtitles]
PRESENTATION:
- [Bullet point 1 for slide]
- [Bullet point 2 for slide]
- [Bullet point 3 for slide]

[Continue for all 15 scenes...]

SCRIPT 3:
SCENE 1:
SCRIPT: [Sentence 1 text for speaking/subtitles]
PRESENTATION:
- [Bullet point 1 for slide]
- [Bullet point 2 for slide]
- [Bullet point 3 for slide]

[Continue for all 15 scenes...]`

      const result = await model.generateContent(prompt)
      const response = await result.response
      const output = response.text()

      // Parse the 3 scripts from the response with presentation_text
      const scripts: ScriptData[] = []
      const scriptRegex = /SCRIPT (\d+):\s*([\s\S]*?)(?=SCRIPT \d+:|$)/g
      let match
      
      while ((match = scriptRegex.exec(output)) !== null) {        const scriptContent = match[2].trim()
        
        // Parse each scene to extract script and presentation_text
        const scenes: Sentence[] = []
        let scriptTextParts: string[] = []
        
        // Parse scenes with format: SCENE N: SCRIPT: ... PRESENTATION: ...
        const sceneRegex = /SCENE (\d+):\s*SCRIPT:\s*([^\n]+(?:\n(?!PRESENTATION:)[^\n]+)*)\s*PRESENTATION:\s*((?:-\s*[^\n]+\s*)+)/g
        let sceneMatch
        
        while ((sceneMatch = sceneRegex.exec(scriptContent)) !== null) {
          const sceneNum = parseInt(sceneMatch[1], 10)
          const scriptSentence = sceneMatch[2].trim()
          const presentationSection = sceneMatch[3].trim()
          
          // Parse bullet points from presentation section
          const bulletPoints = presentationSection
            .split(/\n/)
            .map(line => line.trim())
            .filter(line => line.startsWith('- '))
            .map(line => line.substring(2).trim())
            .filter(line => line.length > 0)
          
          scriptTextParts.push(scriptSentence)
          
          scenes.push({
            id: this.generateSentenceId(sceneNum - 1),
            text: scriptSentence,
            presentation_text: bulletPoints.length > 0 ? bulletPoints : undefined,
            approved: false
          })
        }
        
        // Fallback: If new format parsing fails, try old format
        if (scenes.length === 0) {
          const sentences = this.splitIntoSentences(scriptContent)
          scripts.push({
            script: scriptContent,
            sentences,
            version: 1,
            generatedAt: new Date().toISOString()
          })
        } else {
          scripts.push({
            script: scriptTextParts.join(' '),
            sentences: scenes,
            version: 1,
            generatedAt: new Date().toISOString()
          })
        }
      }

      // If parsing fails completely, try to split by double newlines or other patterns
      if (scripts.length === 0) {
        const parts = output.split(/SCRIPT \d+:/).filter(p => p.trim())
        
        parts.forEach((scriptText) => {
          const sentences = this.splitIntoSentences(scriptText.trim())
          scripts.push({
            script: scriptText.trim(),
            sentences,
            version: 1,
            generatedAt: new Date().toISOString()
          })
        })
      }

      // Ensure we have exactly 3 scripts
      if (scripts.length < 3) {
        throw new Error(`Expected 3 scripts but got ${scripts.length}. Please try again.`)
      }

      return scripts.slice(0, 3)
    } catch (error) {
      console.error('Error generating 3 scripts:', error)
      throw new Error('Failed to generate scripts. Please check your API key and try again.')
    }
  }

  async generateScript(jsonData: JsonData): Promise<ScriptData> {
    this.validateApiKey()

    if (!this.genAI) {
      throw new Error('Gemini AI not initialized')
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      // Prepare categorized images for context
      const methodologyImages = jsonData.images?.filter(img => img.category === 'methodology') || []
      const resultsImages = jsonData.images?.filter(img => img.category === 'results') || []
      // Removed unused figures variable

      const prompt = `You are a professional narration scriptwriter specializing in converting structured research data into short, natural, spoken-style scripts for video or audio narration.

You will receive a JSON object containing:
• metadata: title, authors, keywords, etc.
• sections: abstract, introduction, background, methodology, discussion, results, conclusion
• tables: data tables with key statistics and findings
• images/figures: categorized into methodology (research methods, experimental setup, procedures) and results (findings, outcomes, conclusions)

CRITICAL REQUIREMENT: You MUST extract and use information from ALL sections provided:
1. ABSTRACT: Extract the main research question, key findings, and conclusions
2. INTRODUCTION: Extract the problem statement, research objectives, and significance
3. BACKGROUND: Extract relevant context, literature review insights, and theoretical framework
4. METHODOLOGY: Extract research design, methods, procedures, algorithms, experimental setup, and data collection approaches
5. RESULTS: Extract ALL findings, statistics, performance metrics, comparisons, and quantitative outcomes
6. DISCUSSION: Extract interpretations, implications, limitations, and connections to existing research
7. CONCLUSION: Extract main contributions, future work, and overall impact

IMPORTANT: The images/figures are categorized to help you create more authentic and detailed scripts:
- METHODOLOGY images: Use these when describing research methods, experimental setup, procedures, algorithms, or data collection processes
- RESULTS images: Use these when describing findings, outcomes, performance metrics, or experimental results

Your job is to analyze this JSON and produce a refined, engaging 90-second narration script (exactly 15 sentences, TOTAL word count between 275-350 words for the entire script) that:
• Creates a compelling narrative that makes readers want to explore the full research
• MUST extract and incorporate information from ALL sections (abstract, introduction, background, methodology, results, discussion, conclusion)
• MUST use specific details, statistics, methodologies, and results from EACH section
• MUST reference tables when they contain relevant data or statistics
• References and incorporates information from categorized images/figures when relevant
• When discussing methodology, use insights from methodology images/figures to add authenticity - describe what they show naturally (e.g., "The experimental setup includes...", "The methodology demonstrates...") WITHOUT mentioning figure numbers
• When discussing results, use insights from results images/figures to provide concrete evidence - describe the findings naturally (e.g., "The results reveal...", "Performance metrics show...") WITHOUT mentioning figure numbers
• NEVER mention "Figure 1", "Figure 2", "Fig. 1", "Fig. 2", or any figure numbers in the script
• Builds intellectual curiosity and demonstrates the depth of the study
• Avoids generic phrases like "this video" or superficial summaries
• Each sentence must contain substantial, specific information extracted from the actual section content
• Creates a sophisticated narrative that reflects the academic rigor of the work
• Uses precise terminology and findings that showcase the study's contributions
• STRUCTURE: Must have a strong opening hook, progressive body development, and impactful closing
• NARRATIVE ARC: Build from problem identification through methodology to results and implications
• CRITICAL: Each of the 15 sentences must be UNIQUE and DISTINCT - never repeat the same sentence or similar phrasing
• CRITICAL: Do NOT skip any section - ensure information from all 7 sections is represented in the script

🎯 PERFECT SCRIPT STRUCTURE (15 Sentences Total):

**OPENING (Sentences 1-3): THE HOOK & CONTEXT**
- Sentence 1: STRONG OPENING HOOK - Start with a compelling question, surprising fact, or bold statement that immediately captures attention. Reference the paper title and create intellectual curiosity. Examples: "What if [key problem] could be solved through [innovative approach]?" or "[Surprising statistic/claim] - this groundbreaking research by [authors] challenges our understanding of [field]."
- Sentence 2: ESTABLISH CREDIBILITY & CONTEXT - Mention authors (full names if available) and their affiliation/institution. Set the research context, define the problem space, and explain why this research matters. Connect to the broader field or real-world implications.
- Sentence 3: RESEARCH OBJECTIVE - Clearly state what this study aims to achieve. Use the introduction and abstract to identify the main research question or objective. Frame it as an important question that needs answering.

**BODY - BACKGROUND & METHODOLOGY (Sentences 4-7): THE FOUNDATION**
- Sentence 4: BACKGROUND CONTEXT - Provide necessary context from the background section. Explain existing knowledge, gaps in the field, or why this research is needed. Reference literature insights or theoretical framework.
- Sentence 5: RESEARCH MOTIVATION - Explain what drove this research. What problem does it address? What limitations of previous work does it overcome? Use introduction and background sections.
- Sentence 6: METHODOLOGY OVERVIEW - Describe the research approach, methods, or experimental design from the methodology section. Be specific about techniques, datasets, or procedures used. Reference methodology images naturally.
- Sentence 7: METHODOLOGICAL DETAILS - Provide key methodological specifics: sample sizes, algorithms, experimental setup, data collection procedures, or analytical techniques. Reference methodology images to add authenticity.

**BODY - RESULTS & FINDINGS (Sentences 8-11): THE EVIDENCE**
- Sentence 8: KEY FINDING #1 - Present the first major finding or result with specific statistics, metrics, or data points. Use actual numbers from results section or tables. Reference results images naturally.
- Sentence 9: KEY FINDING #2 - Present another significant finding with quantitative data. Include comparisons, improvements, or performance metrics. Use tables if relevant.
- Sentence 10: COMPARATIVE ANALYSIS - Discuss how the results compare to previous work, benchmarks, or expectations. Include statistical significance, effect sizes, or performance improvements.
- Sentence 11: ADDITIONAL INSIGHTS - Present nuanced findings, unexpected results, or interesting patterns. Use discussion section to interpret what these results mean.

**BODY - DISCUSSION & IMPLICATIONS (Sentences 12-13): THE MEANING**
- Sentence 12: INTERPRETATION - Explain what the findings mean from the discussion section. Discuss implications, why these results matter, or what they reveal about the research question.
- Sentence 13: BROADER IMPACT - Connect findings to broader implications: field impact, practical applications, theoretical contributions, or real-world significance. Use discussion and conclusion sections.

**CLOSING (Sentences 14-15): THE IMPACT**
- Sentence 14: MAJOR CONTRIBUTIONS - Highlight the study's most significant contributions to the field. What does this research add that wasn't known before? What are the key takeaways? Use conclusion section.
- Sentence 15: POWERFUL CONCLUSION - Create a memorable closing that explains why this research matters and motivates exploration of the full study. End with impact, future possibilities, or the broader significance. Make it resonate emotionally and intellectually. DO NOT end with just data - end with meaning and inspiration.

🎯 QUALITY STANDARDS:
• SENTENCE LENGTH: Each sentence should be 15-25 words (normal range). Avoid sentences exceeding 30 words. Maintain consistent length for better narration flow.
• TOTAL WORD COUNT: ENTIRE script must be 275-350 words across all 15 sentences.
• OPENING QUALITY: First sentence MUST be a compelling hook that grabs attention immediately. Never start with generic phrases like "This research" or "In this paper."
• TRANSITIONS: Use smooth connecting phrases between sentences (e.g., "Building on this foundation...", "These findings reveal...", "Furthermore...", "Critically...").
• SPECIFICITY: Include actual numbers, statistics, percentages, sample sizes, and specific details from the research. Avoid vague language.
• VARIETY: Use varied sentence structures and vocabulary. Avoid repetition of phrases or concepts.
• INFORMATION COMPLETENESS: Extract from ALL 7 sections (abstract, introduction, background, methodology, results, discussion, conclusion). Balance information density across sentences.
• PROFESSIONAL TONE: Write in a sophisticated, academic yet accessible tone. Sound like a professional narrator, not generic AI.
• FIGURE USAGE: Reference methodology and results images naturally without mentioning figure numbers. Describe what they show as part of the narrative.

COMPLETE PAPER DATA (USE ALL SECTIONS):
${JSON.stringify(jsonData, null, 2)}

SECTION BREAKDOWN (Ensure you extract from ALL):
- Abstract: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.abstract) ? `${String(jsonData.sections.abstract).substring(0, 500)}...` : 'Not available'}
- Introduction: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.introduction) ? `${String(jsonData.sections.introduction).substring(0, 500)}...` : 'Not available'}
- Background: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.background) ? `${String(jsonData.sections.background).substring(0, 500)}...` : 'Not available'}
- Methodology: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.methodology) ? `${String(jsonData.sections.methodology).substring(0, 500)}...` : 'Not available'}
- Results: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.results) ? `${String(jsonData.sections.results).substring(0, 500)}...` : 'Not available'}
- Discussion: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.discussion) ? `${String(jsonData.sections.discussion).substring(0, 500)}...` : 'Not available'}
- Conclusion: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.conclusion) ? `${String(jsonData.sections.conclusion).substring(0, 500)}...` : 'Not available'}

Tables: ${jsonData.tables && jsonData.tables.length > 0 ? `${jsonData.tables.length} table(s) with data` : 'No tables'}

Categorized Images/Figures:
${methodologyImages.length > 0 ? `\nMETHODOLOGY IMAGES (${methodologyImages.length}):\n${methodologyImages.map((img, idx) => `- ${img.caption || `Figure ${idx + 1}`}: ${img.description}`).join('\n')}` : 'No methodology images'}
${resultsImages.length > 0 ? `\nRESULTS IMAGES (${resultsImages.length}):\n${resultsImages.map((img, idx) => `- ${img.caption || `Figure ${idx + 1}`}: ${img.description}`).join('\n')}` : 'No results images'}

CRITICAL: Generate EXACTLY 15 UNIQUE sentences. Each sentence must be completely different - never repeat the same sentence or similar phrasing. Each sentence should cover different aspects, findings, or implications from the research. Ensure you extract information from ALL 7 sections (abstract, introduction, background, methodology, results, discussion, conclusion).

ABSOLUTE REQUIREMENT: NEVER mention "Figure 1", "Figure 2", "Fig. 1", "Fig. 2", or any figure numbers. Instead, describe what the figures show naturally (e.g., "The experimental setup demonstrates...", "The results reveal a 15% improvement...", "Performance metrics show...") without referencing figure numbers.

Format your response EXACTLY as follows (no other text):

SCENE 1:
SCRIPT: [Sentence 1 text for speaking/subtitles]
PRESENTATION:
- [Bullet point 1 for slide]
- [Bullet point 2 for slide]
- [Bullet point 3 for slide]

SCENE 2:
SCRIPT: [Sentence 2 text for speaking/subtitles]
PRESENTATION:
- [Bullet point 1 for slide]
- [Bullet point 2 for slide]
- [Bullet point 3 for slide]

[Continue for all 15 scenes...]`

      const result = await model.generateContent(prompt)
      const response = await result.response
      const output = response.text()

      // Parse scenes with script and presentation_text
      const scenes: Sentence[] = []
      let scriptTextParts: string[] = []
      
      // Parse scenes with format: SCENE N: SCRIPT: ... PRESENTATION: ...
      // Updated regex to handle multi-line script text properly
      const sceneRegex = /SCENE (\d+):\s*SCRIPT:\s*([\s\S]*?)\s*PRESENTATION:\s*((?:-\s*[^\n]+\s*)+)/g
      let sceneMatch
      
      while ((sceneMatch = sceneRegex.exec(output)) !== null) {
        const sceneNum = parseInt(sceneMatch[1], 10)
        const scriptSentence = sceneMatch[2].trim()
        const presentationSection = sceneMatch[3].trim()
        
        // Parse bullet points from presentation section
        const bulletPoints = presentationSection
          .split(/\n/)
          .map(line => line.trim())
          .filter(line => line.startsWith('- '))
          .map(line => line.substring(2).trim())
          .filter(line => line.length > 0)
        
        scriptTextParts.push(scriptSentence)
        
        scenes.push({
          id: this.generateSentenceId(sceneNum - 1),
          text: scriptSentence,
          presentation_text: bulletPoints.length > 0 ? bulletPoints : undefined,
          approved: false
        })
      }
      
      // Fallback: If new format parsing fails, use old format
      let sentences: Sentence[]
      let script: string
      
      if (scenes.length === 0) {
        // Old format fallback
        sentences = this.splitIntoSentences(output)
        script = output
      } else {
        sentences = scenes
        script = scriptTextParts.join(' ')
      }

      return {
        script,
        sentences,
        version: 1,
        generatedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error generating script:', error)
      throw new Error('Failed to generate script. Please check your API key and try again.')
    }
  }

  async regenerateUnapprovedSentences(jsonData: JsonData, currentScriptData: ScriptData): Promise<ScriptData> {
    this.validateApiKey()

    if (!this.genAI) {
      throw new Error('Gemini AI not initialized')
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      // Find approved and unapproved sentences
      const unapprovedSentences = currentScriptData.sentences.filter(s => !s.approved)
      
      if (unapprovedSentences.length === 0) {
        // All sentences are approved, return current data
        return currentScriptData
      }

      // Create a template with placeholders for unapproved sentences
      // const template = currentScriptData.sentences.map((sentence, index) => {
      //   if (sentence.approved) {
      //     return sentence.text // Keep approved sentences as-is
      //   } else {
      //     return `[REGENERATE_SENTENCE_${index}]` // Placeholder for unapproved
      //   }
      // }).join(' ')

      const prompt = `You are a professional narration scriptwriter specializing in converting structured research data into short, natural, spoken-style scripts for video or audio narration.

You will receive a JSON object containing:
• metadata: title, authors, keywords, etc.
• sections: abstract, introduction, background, methodology, discussion, results, conclusion

Your job is to analyze this JSON and produce a refined, engaging 90-second narration script (exactly 15 sentences, TOTAL word count between 275-350 words for the entire script) that:
• Creates a compelling narrative that makes readers want to explore the full research
• Covers ALL significant data, findings, and insights from the entire JSON content
• Uses specific details, statistics, methodologies, and results from the research
• Builds intellectual curiosity and demonstrates the depth of the study
• Avoids generic phrases like "this video" or superficial summaries
• Each sentence must contain substantial, specific information from the research
• Creates a sophisticated narrative that reflects the academic rigor of the work
• Uses precise terminology and findings that showcase the study's contributions
• STRUCTURE: Must have a strong opening hook, progressive body development, and impactful closing
• NARRATIVE ARC: Build from problem identification through methodology to results and implications
• CRITICAL: Each of the 15 sentences must be UNIQUE and DISTINCT - never repeat the same sentence or similar phrasing

🎯 PERFECT SCRIPT STRUCTURE (15 Sentences Total):

**OPENING (Sentences 1-3): THE HOOK & CONTEXT**
- Sentence 1: STRONG OPENING HOOK - Start with a compelling question, surprising fact, or bold statement that immediately captures attention. Reference the paper title and create intellectual curiosity. NEVER start with generic phrases like "This research" or "In this paper."
- Sentence 2: ESTABLISH CREDIBILITY & CONTEXT - Mention authors (full names if available) and their affiliation/institution. Set the research context, define the problem space, and explain why this research matters.
- Sentence 3: RESEARCH OBJECTIVE - Clearly state what this study aims to achieve. Frame it as an important question that needs answering.

**BODY - BACKGROUND & METHODOLOGY (Sentences 4-7): THE FOUNDATION**
- Sentence 4: BACKGROUND CONTEXT - Provide necessary context from the background section. Explain existing knowledge, gaps in the field, or why this research is needed.
- Sentence 5: RESEARCH MOTIVATION - Explain what drove this research. What problem does it address? What limitations of previous work does it overcome?
- Sentence 6: METHODOLOGY OVERVIEW - Describe the research approach, methods, or experimental design. Be specific about techniques, datasets, or procedures used.
- Sentence 7: METHODOLOGICAL DETAILS - Provide key methodological specifics: sample sizes, algorithms, experimental setup, data collection procedures, or analytical techniques.

**BODY - RESULTS & FINDINGS (Sentences 8-11): THE EVIDENCE**
- Sentence 8: KEY FINDING #1 - Present the first major finding or result with specific statistics, metrics, or data points. Use actual numbers from results section or tables.
- Sentence 9: KEY FINDING #2 - Present another significant finding with quantitative data. Include comparisons, improvements, or performance metrics.
- Sentence 10: COMPARATIVE ANALYSIS - Discuss how the results compare to previous work, benchmarks, or expectations. Include statistical significance, effect sizes, or performance improvements.
- Sentence 11: ADDITIONAL INSIGHTS - Present nuanced findings, unexpected results, or interesting patterns.

**BODY - DISCUSSION & IMPLICATIONS (Sentences 12-13): THE MEANING**
- Sentence 12: INTERPRETATION - Explain what the findings mean. Discuss implications, why these results matter, or what they reveal about the research question.
- Sentence 13: BROADER IMPACT - Connect findings to broader implications: field impact, practical applications, theoretical contributions, or real-world significance.

**CLOSING (Sentences 14-15): THE IMPACT**
- Sentence 14: MAJOR CONTRIBUTIONS - Highlight the study's most significant contributions to the field. What does this research add that wasn't known before?
- Sentence 15: POWERFUL CONCLUSION - Create a memorable closing that explains why this research matters and motivates exploration of the full study. End with impact, future possibilities, or the broader significance. DO NOT end with just data - end with meaning and inspiration.

🎯 QUALITY STANDARDS:
• SENTENCE LENGTH: Each sentence should be 15-25 words (normal range). Avoid sentences exceeding 30 words.
• TOTAL WORD COUNT: ENTIRE script must be 275-350 words across all 15 sentences.
• OPENING QUALITY: First sentence MUST be a compelling hook that grabs attention immediately.
• TRANSITIONS: Use smooth connecting phrases between sentences (e.g., "Building on this foundation...", "These findings reveal...", "Furthermore...").
• SPECIFICITY: Include actual numbers, statistics, percentages, sample sizes, and specific details from the research.
• VARIETY: Use varied sentence structures and vocabulary. Avoid repetition.
• PROFESSIONAL TONE: Write in a sophisticated, academic yet accessible tone.

CRITICAL REQUIREMENTS:
• Generate EXACTLY 15 UNIQUE sentences - each sentence must be completely different from all others
• Never repeat the same sentence, even with slight variations - each sentence should cover different aspects, findings, or implications
• Every sentence must contain specific data, findings, or insights from the research
• Use exact statistics, percentages, sample sizes, and methodological details
• Include specific examples, case studies, or results mentioned in the research
• Create intellectual intrigue that makes readers want to understand the full study
• Demonstrate the sophistication and depth of the academic work
• Avoid generic academic language - use the specific terminology and findings from this research
• Make each sentence valuable and informative - no filler content
• OPENING: Must hook the reader with a compelling problem statement and research significance
• CLOSING: Must create impact and leave readers with clear takeaways and curiosity for more
• FINAL SENTENCE: Must be a powerful conclusion that explains the broader significance and motivates further exploration
• SENTENCE DENSITY: Distribute information evenly across sentences - avoid cramming too much into single sentences
• FLOW: Use smooth transitions between findings and implications - don't jump abruptly from data to conclusions
• CONCLUSION EMPHASIS: Make the final sentences the most impactful and memorable part of the script

Paper Data:
${JSON.stringify(jsonData, null, 2)}

Generate a complete script that maintains the same structure and flow as the original. Focus on creating natural, engaging content that accurately represents the research.

🎯 PERFECT SCRIPT STRUCTURE (15 Sentences Total):

**OPENING (Sentences 1-3): THE HOOK & CONTEXT**
- Sentence 1: STRONG OPENING HOOK - Start with a compelling question, surprising fact, or bold statement that immediately captures attention. Reference the paper title and create intellectual curiosity. NEVER start with generic phrases like "This research" or "In this paper."
- Sentence 2: ESTABLISH CREDIBILITY & CONTEXT - Mention authors (full names if available) and their affiliation/institution. Set the research context, define the problem space, and explain why this research matters.
- Sentence 3: RESEARCH OBJECTIVE - Clearly state what this study aims to achieve. Frame it as an important question that needs answering.

**BODY - BACKGROUND & METHODOLOGY (Sentences 4-7): THE FOUNDATION**
- Sentence 4: BACKGROUND CONTEXT - Provide necessary context from the background section. Explain existing knowledge, gaps in the field, or why this research is needed.
- Sentence 5: RESEARCH MOTIVATION - Explain what drove this research. What problem does it address? What limitations of previous work does it overcome?
- Sentence 6: METHODOLOGY OVERVIEW - Describe the research approach, methods, or experimental design. Be specific about techniques, datasets, or procedures used.
- Sentence 7: METHODOLOGICAL DETAILS - Provide key methodological specifics: sample sizes, algorithms, experimental setup, data collection procedures, or analytical techniques.

**BODY - RESULTS & FINDINGS (Sentences 8-11): THE EVIDENCE**
- Sentence 8: KEY FINDING #1 - Present the first major finding or result with specific statistics, metrics, or data points. Use actual numbers from results section or tables.
- Sentence 9: KEY FINDING #2 - Present another significant finding with quantitative data. Include comparisons, improvements, or performance metrics.
- Sentence 10: COMPARATIVE ANALYSIS - Discuss how the results compare to previous work, benchmarks, or expectations. Include statistical significance, effect sizes, or performance improvements.
- Sentence 11: ADDITIONAL INSIGHTS - Present nuanced findings, unexpected results, or interesting patterns.

**BODY - DISCUSSION & IMPLICATIONS (Sentences 12-13): THE MEANING**
- Sentence 12: INTERPRETATION - Explain what the findings mean. Discuss implications, why these results matter, or what they reveal about the research question.
- Sentence 13: BROADER IMPACT - Connect findings to broader implications: field impact, practical applications, theoretical contributions, or real-world significance.

**CLOSING (Sentences 14-15): THE IMPACT**
- Sentence 14: MAJOR CONTRIBUTIONS - Highlight the study's most significant contributions to the field. What does this research add that wasn't known before?
- Sentence 15: POWERFUL CONCLUSION - Create a memorable closing that explains why this research matters and motivates exploration of the full study. End with impact, future possibilities, or the broader significance. DO NOT end with just data - end with meaning and inspiration.

🎯 QUALITY STANDARDS:
• SENTENCE LENGTH: Each sentence should be 15-25 words (normal range). Avoid sentences exceeding 30 words.
• TOTAL WORD COUNT: ENTIRE script must be 275-350 words across all 15 sentences.
• OPENING QUALITY: First sentence MUST be a compelling hook that grabs attention immediately.
• TRANSITIONS: Use smooth connecting phrases between sentences (e.g., "Building on this foundation...", "These findings reveal...", "Furthermore...").
• SPECIFICITY: Include actual numbers, statistics, percentages, sample sizes, and specific details from the research.
• VARIETY: Use varied sentence structures and vocabulary. Avoid repetition.
• PROFESSIONAL TONE: Write in a sophisticated, academic yet accessible tone.

Generate only the script text, no additional commentary or formatting.`

      const result = await model.generateContent(prompt)
      const response = await result.response
      const script = response.text()

      // Split the script into sentences
      const regeneratedSentences = this.splitIntoSentences(script)

      // Create final sentences array preserving approved sentences
      const finalSentences = currentScriptData.sentences.map((originalSentence, index) => {
        if (originalSentence.approved) {
          // Keep approved sentences exactly as they are
          return originalSentence
        } else {
          // Use regenerated sentence for unapproved ones
          const regeneratedSentence = regeneratedSentences[index] || originalSentence
          return {
            id: originalSentence.id,
            text: regeneratedSentence.text,
            approved: false,
            startTime: originalSentence.startTime,
            endTime: originalSentence.endTime
          }
        }
      })

      // Create updated script text
      const updatedScript = finalSentences.map(s => s.text).join(' ')

      return {
        script: updatedScript,
        sentences: finalSentences,
        version: currentScriptData.version + 1,
        generatedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error regenerating unapproved sentences:', error)
      throw new Error('Failed to regenerate script. Please check your API key and try again.')
    }
  }

  async regenerateScript(jsonData: JsonData, currentScript?: string): Promise<ScriptData> {
    this.validateApiKey()

    if (!this.genAI) {
      throw new Error('Gemini AI not initialized')
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      // Prepare categorized images for context
      const methodologyImages = jsonData.images?.filter(img => img.category === 'methodology') || []
      const resultsImages = jsonData.images?.filter(img => img.category === 'results') || []

      const prompt = `You are a professional narration scriptwriter specializing in converting structured research data into short, natural, spoken-style scripts for video or audio narration.

You will receive a JSON object containing:
• metadata: title, authors, keywords, etc.
• sections: abstract, introduction, background, methodology, discussion, results, conclusion
• tables: data tables with key statistics and findings
• images/figures: categorized into methodology (research methods, experimental setup, procedures) and results (findings, outcomes, conclusions)

CRITICAL REQUIREMENT: You MUST extract and use information from ALL sections provided:
1. ABSTRACT: Extract the main research question, key findings, and conclusions
2. INTRODUCTION: Extract the problem statement, research objectives, and significance
3. BACKGROUND: Extract relevant context, literature review insights, and theoretical framework
4. METHODOLOGY: Extract research design, methods, procedures, algorithms, experimental setup, and data collection approaches
5. RESULTS: Extract ALL findings, statistics, performance metrics, comparisons, and quantitative outcomes
6. DISCUSSION: Extract interpretations, implications, limitations, and connections to existing research
7. CONCLUSION: Extract main contributions, future work, and overall impact

IMPORTANT: The images/figures are categorized to help you create more authentic and detailed scripts:
- METHODOLOGY images: Use these when describing research methods, experimental setup, procedures, algorithms, or data collection processes
- RESULTS images: Use these when describing findings, outcomes, performance metrics, or experimental results

Your job is to analyze this JSON and produce a refined, engaging 90-second narration script (exactly 15 sentences, TOTAL word count between 275-350 words for the entire script) that:
• Creates a compelling narrative that makes readers want to explore the full research
• MUST extract and incorporate information from ALL sections (abstract, introduction, background, methodology, results, discussion, conclusion)
• MUST use specific details, statistics, methodologies, and results from EACH section
• MUST reference tables when they contain relevant data or statistics
• References and incorporates information from categorized images/figures when relevant
• When discussing methodology, use insights from methodology images/figures to add authenticity - describe what they show naturally (e.g., "The experimental setup includes...", "The methodology demonstrates...") WITHOUT mentioning figure numbers
• When discussing results, use insights from results images/figures to provide concrete evidence - describe the findings naturally (e.g., "The results reveal...", "Performance metrics show...") WITHOUT mentioning figure numbers
• NEVER mention "Figure 1", "Figure 2", "Fig. 1", "Fig. 2", or any figure numbers in the script
• Builds intellectual curiosity and demonstrates the depth of the study
• Avoids generic phrases like "this video" or superficial summaries
• Each sentence must contain substantial, specific information extracted from the actual section content
• Creates a sophisticated narrative that reflects the academic rigor of the work
• Uses precise terminology and findings that showcase the study's contributions
• STRUCTURE: Must have a strong opening hook, progressive body development, and impactful closing
• NARRATIVE ARC: Build from problem identification through methodology to results and implications
• CRITICAL: Each of the 15 sentences must be UNIQUE and DISTINCT - never repeat the same sentence or similar phrasing
• CRITICAL: Do NOT skip any section - ensure information from all 7 sections is represented in the script

🎯 PERFECT SCRIPT STRUCTURE (15 Sentences Total):

**OPENING (Sentences 1-3): THE HOOK & CONTEXT**
- Sentence 1: STRONG OPENING HOOK - Start with a compelling question, surprising fact, or bold statement that immediately captures attention. Reference the paper title and create intellectual curiosity. Examples: "What if [key problem] could be solved through [innovative approach]?" or "[Surprising statistic/claim] - this groundbreaking research by [authors] challenges our understanding of [field]."
- Sentence 2: ESTABLISH CREDIBILITY & CONTEXT - Mention authors (full names if available) and their affiliation/institution. Set the research context, define the problem space, and explain why this research matters. Connect to the broader field or real-world implications.
- Sentence 3: RESEARCH OBJECTIVE - Clearly state what this study aims to achieve. Use the introduction and abstract to identify the main research question or objective. Frame it as an important question that needs answering.

**BODY - BACKGROUND & METHODOLOGY (Sentences 4-7): THE FOUNDATION**
- Sentence 4: BACKGROUND CONTEXT - Provide necessary context from the background section. Explain existing knowledge, gaps in the field, or why this research is needed. Reference literature insights or theoretical framework.
- Sentence 5: RESEARCH MOTIVATION - Explain what drove this research. What problem does it address? What limitations of previous work does it overcome? Use introduction and background sections.
- Sentence 6: METHODOLOGY OVERVIEW - Describe the research approach, methods, or experimental design from the methodology section. Be specific about techniques, datasets, or procedures used. Reference methodology images naturally.
- Sentence 7: METHODOLOGICAL DETAILS - Provide key methodological specifics: sample sizes, algorithms, experimental setup, data collection procedures, or analytical techniques. Reference methodology images to add authenticity.

**BODY - RESULTS & FINDINGS (Sentences 8-11): THE EVIDENCE**
- Sentence 8: KEY FINDING #1 - Present the first major finding or result with specific statistics, metrics, or data points. Use actual numbers from results section or tables. Reference results images naturally.
- Sentence 9: KEY FINDING #2 - Present another significant finding with quantitative data. Include comparisons, improvements, or performance metrics. Use tables if relevant.
- Sentence 10: COMPARATIVE ANALYSIS - Discuss how the results compare to previous work, benchmarks, or expectations. Include statistical significance, effect sizes, or performance improvements.
- Sentence 11: ADDITIONAL INSIGHTS - Present nuanced findings, unexpected results, or interesting patterns. Use discussion section to interpret what these results mean.

**BODY - DISCUSSION & IMPLICATIONS (Sentences 12-13): THE MEANING**
- Sentence 12: INTERPRETATION - Explain what the findings mean from the discussion section. Discuss implications, why these results matter, or what they reveal about the research question.
- Sentence 13: BROADER IMPACT - Connect findings to broader implications: field impact, practical applications, theoretical contributions, or real-world significance. Use discussion and conclusion sections.

**CLOSING (Sentences 14-15): THE IMPACT**
- Sentence 14: MAJOR CONTRIBUTIONS - Highlight the study's most significant contributions to the field. What does this research add that wasn't known before? What are the key takeaways? Use conclusion section.
- Sentence 15: POWERFUL CONCLUSION - Create a memorable closing that explains why this research matters and motivates exploration of the full study. End with impact, future possibilities, or the broader significance. Make it resonate emotionally and intellectually. DO NOT end with just data - end with meaning and inspiration.

🎯 QUALITY STANDARDS:
• SENTENCE LENGTH: Each sentence should be 15-25 words (normal range). Avoid sentences exceeding 30 words. Maintain consistent length for better narration flow.
• TOTAL WORD COUNT: ENTIRE script must be 275-350 words across all 15 sentences.
• OPENING QUALITY: First sentence MUST be a compelling hook that grabs attention immediately. Never start with generic phrases like "This research" or "In this paper."
• TRANSITIONS: Use smooth connecting phrases between sentences (e.g., "Building on this foundation...", "These findings reveal...", "Furthermore...", "Critically...").
• SPECIFICITY: Include actual numbers, statistics, percentages, sample sizes, and specific details from the research. Avoid vague language.
• VARIETY: Use varied sentence structures and vocabulary. Avoid repetition of phrases or concepts.
• INFORMATION COMPLETENESS: Extract from ALL 7 sections (abstract, introduction, background, methodology, results, discussion, conclusion). Balance information density across sentences.
• PROFESSIONAL TONE: Write in a sophisticated, academic yet accessible tone. Sound like a professional narrator, not generic AI.
• FIGURE USAGE: Reference methodology and results images naturally without mentioning figure numbers. Describe what they show as part of the narrative.

COMPLETE PAPER DATA (USE ALL SECTIONS):
${JSON.stringify(jsonData, null, 2)}

SECTION BREAKDOWN (Ensure you extract from ALL):
- Abstract: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.abstract) ? `${String(jsonData.sections.abstract).substring(0, 500)}...` : 'Not available'}
- Introduction: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.introduction) ? `${String(jsonData.sections.introduction).substring(0, 500)}...` : 'Not available'}
- Background: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.background) ? `${String(jsonData.sections.background).substring(0, 500)}...` : 'Not available'}
- Methodology: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.methodology) ? `${String(jsonData.sections.methodology).substring(0, 500)}...` : 'Not available'}
- Results: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.results) ? `${String(jsonData.sections.results).substring(0, 500)}...` : 'Not available'}
- Discussion: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.discussion) ? `${String(jsonData.sections.discussion).substring(0, 500)}...` : 'Not available'}
- Conclusion: ${(jsonData.sections && typeof jsonData.sections === 'object' && !Array.isArray(jsonData.sections) && jsonData.sections.conclusion) ? `${String(jsonData.sections.conclusion).substring(0, 500)}...` : 'Not available'}

Tables: ${jsonData.tables && jsonData.tables.length > 0 ? `${jsonData.tables.length} table(s) with data` : 'No tables'}

Categorized Images/Figures:
${methodologyImages.length > 0 ? `\nMETHODOLOGY IMAGES (${methodologyImages.length}):\n${methodologyImages.map((img, idx) => `- ${img.caption || `Figure ${idx + 1}`}: ${img.description}`).join('\n')}` : 'No methodology images'}
${resultsImages.length > 0 ? `\nRESULTS IMAGES (${resultsImages.length}):\n${resultsImages.map((img, idx) => `- ${img.caption || `Figure ${idx + 1}`}: ${img.description}`).join('\n')}` : 'No results images'}

${currentScript ? `Previous Script (for reference):
${currentScript}

Please generate a different version while maintaining the same quality and structure.` : ''}

CRITICAL: Generate EXACTLY 15 UNIQUE sentences. Each sentence must be completely different - never repeat the same sentence or similar phrasing. Each sentence should cover different aspects, findings, or implications from the research.

ABSOLUTE REQUIREMENT: NEVER mention "Figure 1", "Figure 2", "Fig. 1", "Fig. 2", or any figure numbers. Instead, describe what the figures show naturally (e.g., "The experimental setup demonstrates...", "The results reveal a 15% improvement...", "Performance metrics show...") without referencing figure numbers.

Generate only the script text, no additional commentary or formatting.`

      const result = await model.generateContent(prompt)
      const response = await result.response
      const script = response.text()

      // Split the script into sentences
      const sentences = this.splitIntoSentences(script)

      return {
        script,
        sentences,
        version: (currentScript ? 2 : 1), // Increment version if regenerating
        generatedAt: new Date().toISOString()
      }
    } catch (error) {
      console.error('Error regenerating script:', error)
      throw new Error('Failed to regenerate script. Please check your API key and try again.')
    }
  }

  exportScript(scriptData: ScriptData, paperTitle: string = 'Untitled Paper'): ExportData {
    const approvedSentences = scriptData.sentences.filter(s => s.approved)
    const finalScript = approvedSentences.map(s => s.text).join(' ')
    
    return {
      paper_title: paperTitle,
      final_script: finalScript || scriptData.script,
      sentences: scriptData.sentences.map(s => ({
        id: s.id,
        text: s.text,
        presentation_text: s.presentation_text, // Include presentation_text in export
        approved: s.approved
      })),
      status: approvedSentences.length === scriptData.sentences.length ? 'approved' : 'draft',
      version: scriptData.version
    }
  }

  downloadScript(exportData: ExportData, filename?: string): void {
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename || `script_${exportData.paper_title.replace(/[^a-zA-Z0-9]/g, '_')}_v${exportData.version}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Generate bullet points (presentation text) for a single sentence using Gemini
   * @param sentence - The sentence text to generate bullet points for
   * @param context - Optional context (full script, paper title, research domain)
   * @returns Array of bullet point strings (2-4 bullet points)
   */
  async generateBulletPoints(
    sentence: string,
    context?: {
      fullScript?: string;
      paperTitle?: string;
      researchDomain?: string;
    }
  ): Promise<string[]> {
    this.validateApiKey()

    if (!this.genAI) {
      throw new Error('Gemini API not initialized')
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

      const contextInfo = context?.fullScript 
        ? `\n\nContext from the full research paper:\n${context.fullScript.substring(0, 1000)}`
        : context?.paperTitle
        ? `\n\nResearch paper title: ${context.paperTitle}`
        : ''

      const prompt = `You are an expert at creating concise bullet points for academic presentation slides.

Given the following sentence from a research paper, generate 2-4 concise bullet points that summarize the key concepts, findings, or implications.

Sentence: "${sentence}"${contextInfo}

Requirements:
- Generate 2-4 bullet points (prefer 3 if appropriate)
- Each bullet point should be 10-15 words maximum
- Focus on key concepts, findings, or implications
- Use clear, direct language suitable for visual presentation
- Do NOT include bullet symbols (dashes or bullets) - just the text

Format your response as a simple list, one bullet point per line, without any prefixes or bullets. Example:

Key finding about methodology
Important statistical result
Research implication or contribution

Return ONLY the bullet points, one per line, nothing else.`

      const result = await model.generateContent(prompt)
      const response = await result.response
      const output = response.text()

      // Parse bullet points from response (one per line, trim each line)
      const bulletPoints = output
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .slice(0, 4) // Max 4 bullet points

      return bulletPoints.length > 0 ? bulletPoints : ['Key point from research']
    } catch (error: any) {
      console.error('Failed to generate bullet points:', error)
      // Return a fallback bullet point
      return [sentence.substring(0, 60) + '...']
    }
  }
}

export const geminiService = new GeminiService()
