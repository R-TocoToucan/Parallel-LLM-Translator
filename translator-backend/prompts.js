export const PROMPTS = {
    translate_webpage: (text, targetLang) => `
    Translate the text under """""" into ${targetLang}, preserving the tone, style, and context of the original text as it appears on a webpage. Ensure the translation is natural, accurate, and suitable for direct insertion below the original text. Provide only the translated text as output, without additional explanations or formatting. Output must be in ${targetLang}.
    
    """
    ${text}
    """`,
  
    explain_phrase: (text, lang) => `
    Explain the meaning and usage of the text under """""". Provide a simple definition, relevant usage notes, and one or two example sentences. Keep it concise and helpful for language learners. Output must be in ${lang}. Provide only the explanation as output, without additional formatting or commentary.
    
    """
    ${text}
    """`,

  // 텍스트를 문법과 표현을 다듬어 개선합니다. (원본 언어 유지)
    enhance_text: (text) => `
    Improve the text under """""", correcting grammar, refining word choice, and enhancing clarity and fluency.
    Follow the original language of the input text.
    Provide only the improved version as output, without any explanations or formatting.

    """
    ${text}
    """`,

  
    summarize_webpage: (text, lang) => `
    Extract and summarize only the meaningful content from the webpage text under """""". Focus on the main article/post and key comments or replies if available. Ignore HTML tags, navigation bars, advertisements, footers, scripts, and any other irrelevant page elements. Summarize in a clear, concise, and natural way, capturing the core ideas and tone of the original content. Output only the summary text, with no extra formatting or explanations. Output must be in ${lang}.
    
    """
    ${text}
    """`,
    };
  
  export const SYSTEM_MESSAGE =
    "You are a professional translator and language assistant trained to output only the requested transformation, with no extra commentary or markdown.";