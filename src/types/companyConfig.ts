export type CompanyFile = {
  id: string
  name: string
  content: string
  uploadedAt: string
}

export type CompanyConfig = {
  name: string
  tagline: string
  kvk: string
  website: string
  contactEmail: string
  profile: string
  competencies: string
  usps: string
  references: string
  files: CompanyFile[]
  updatedAt: string
}

export const defaultCompanyConfig: CompanyConfig = {
  name: 'Besteed Het Uit',
  tagline: 'Bidmanagement en AI-ondersteunde inschrijvingen',
  kvk: '',
  website: '',
  contactEmail: '',
  profile:
    'Besteed Het Uit combineert senior bidmanagement, domeinkennis en AI-ondersteunde kwaliteitscontrole. Het team werkt met vaste reviewmomenten, bewezen formats, bronverwijzingen en een pragmatische implementatieaanpak.',
  competencies: 'Bidmanagement, tenderanalyse, conceptontwikkeling, kwaliteitsreview',
  usps: 'Snelle doorlooptijd, toetsbare bewijsvoering, geïntegreerde AI-review',
  references: '',
  files: [],
  updatedAt: '',
}
