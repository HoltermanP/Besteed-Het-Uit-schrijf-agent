export type StyleDocumentCategory =
  | 'richtlijnen'
  | 'kwaliteit'
  | 'schrijfstijl'
  | 'voorbeeld'
  | 'aanbesteding'

export type StyleDocumentPromptType = 'rules' | 'training'

/** Door AI gedistilleerd profiel van een brondocument. */
export type SourceProfile = {
  /** Toon, zinsbouw, structuur en formuleringsvoorkeuren. */
  schrijfstijl: string
  /** Concrete feiten, cijfers en inhoudelijke kennis voor onderbouwing. */
  kennis: string
  /** Ervaringen, referenties en cases uit eerdere aanbestedingen. */
  ervaringen: string
  /** Bredere achtergrond en context. */
  achtergrond: string
}

export type StyleDocument = {
  id: string
  name: string
  fileName: string
  mimeType: string
  category: StyleDocumentCategory
  promptType: StyleDocumentPromptType
  content: string
  /** Gedistilleerd AI-profiel; null wanneer (nog) niet geanalyseerd. */
  analysis?: SourceProfile | null
  /** ISO-tijdstip van de laatste AI-analyse. */
  analyzedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type StyleDocumentInput = {
  name: string
  category: StyleDocumentCategory
  promptType: StyleDocumentPromptType
}

export const styleCategoryLabels: Record<StyleDocumentCategory, string> = {
  richtlijnen: 'Richtlijnen & regels',
  kwaliteit: 'Kwaliteitsstandaarden',
  schrijfstijl: 'Schrijfstijl',
  voorbeeld: 'Voorbeeldteksten',
  aanbesteding: 'Eerdere aanbesteding & achtergrond',
}

/** Categorieën waarvoor een AI-analyse zinvol is (gedistilleerd profiel). */
export const analyzableCategories: StyleDocumentCategory[] = ['aanbesteding']

export function isAnalyzableCategory(category: StyleDocumentCategory): boolean {
  return analyzableCategories.includes(category)
}

export const sourceProfileLabels: Record<keyof SourceProfile, string> = {
  schrijfstijl: 'Schrijfstijl',
  kennis: 'Kennis & feiten',
  ervaringen: 'Ervaringen & cases',
  achtergrond: 'Achtergrond & context',
}

export const rulesCategoryLabels: Record<'richtlijnen' | 'kwaliteit', string> = {
  richtlijnen: 'Richtlijnen & regels',
  kwaliteit: 'Kwaliteitsstandaarden',
}

export const rulesCategories = Object.keys(rulesCategoryLabels) as Array<keyof typeof rulesCategoryLabels>

/** De drie secties van het Schrijfkader: regels, schrijfwijze en kwaliteit op één pagina. */
export type KaderSectionKey = 'richtlijnen' | 'schrijfstijl' | 'kwaliteit'

export type KaderSectionMeta = {
  key: KaderSectionKey
  /** Korte titel zoals getoond op de pagina. */
  title: string
  /** Eén zin die de sectie typeert. */
  tagline: string
  /** Hoe de regels/bronnen in deze sectie de schrijfprompt voeden. */
  promptType: StyleDocumentPromptType
}

export const kaderSections: KaderSectionMeta[] = [
  { key: 'richtlijnen', title: 'Schrijfregels', tagline: 'Verplichte formuleringen, verboden woorden en voorschriften', promptType: 'rules' },
  { key: 'schrijfstijl', title: 'Schrijfwijze', tagline: 'Toon, stijl, perspectief en opbouw', promptType: 'training' },
  { key: 'kwaliteit', title: 'Kwaliteit', tagline: 'Onderbouwing, toetsbaarheid en reviewcriteria', promptType: 'rules' },
]

export const kaderSectionKeys = kaderSections.map((section) => section.key)

export function isKaderCategory(category: StyleDocumentCategory): category is KaderSectionKey {
  return (kaderSectionKeys as StyleDocumentCategory[]).includes(category)
}

export const styleCategoryDefaultPromptType: Record<
  StyleDocumentCategory,
  StyleDocumentPromptType
> = {
  richtlijnen: 'rules',
  kwaliteit: 'rules',
  schrijfstijl: 'training',
  voorbeeld: 'training',
  aanbesteding: 'training',
}

export const acceptedStyleExtensions = [
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.md',
  '.csv',
  '.html',
  '.htm',
]
