'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  Clock,
  FilePlus2,
  FileText,
  FolderOpen,
  GitCompareArrows,
  GraduationCap,
  Import,
  PenLine,
  Plus,
  Pencil,
  ScanSearch,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { listProjects, removeProject, renameProject, upsertProject, type ProjectMeta } from '../lib/projects'
import { loadDossier, saveDossier } from '../lib/dossier'
import { getSavedTenders } from '../lib/tenderDatabase'
import { createBlankProject, createProjectFromTender } from '../lib/projectFactory'
import { getActiveCompanyId, getCompanies, setActiveCompanyId } from '../lib/companies'
import { flushStorage } from '../lib/storage'
import type { DossierSnapshot, Stage } from '../types/dossier'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ModeToggle } from '@/components/mode-toggle'
import ConfirmDialog from '@/components/ConfirmDialog'
import { notifyUndo } from '@/lib/notify'
import { cn } from '@/lib/utils'

const stageLabels: Record<Stage, string> = {
  brons: 'Brons',
  zilver: 'Zilver',
  goud: 'Goud',
}

const navItems = [
  { href: '/aanbestedingen', label: 'TenderNed-catalogus', Icon: ScanSearch },
  { href: '/configuratie', label: 'Bedrijfsconfiguratie', Icon: Building2 },
  { href: '/schrijfregels', label: 'Schrijfkader', Icon: ClipboardList },
  { href: '/leerpunten', label: 'Lessons learned', Icon: GraduationCap },
  { href: '/vergelijken', label: 'Projecten vergelijken', Icon: GitCompareArrows },
  { href: '/handleiding', label: 'Handleiding', Icon: BookOpen },
  { href: '/admin', label: 'API-beheer', Icon: ShieldCheck },
]

function formatDate(value: string | undefined, withTime = false): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit' as const, minute: '2-digit' as const } : {}),
  })
}

export default function ProjectsOverviewPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [version, setVersion] = useState(0)
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  // Projectenlijst verrijkt met de kerninfo uit elk dossier (documenten, deadline, stadium).
  const projects = useMemo(() => {
    return listProjects().map((meta) => {
      const snapshot = loadDossier<DossierSnapshot>(meta.id)
      return {
        ...meta,
        deadline: snapshot?.project.deadline ?? '',
        tendernedId: snapshot?.project.tendernedId ?? '',
        sourceCount: snapshot?.documents?.length ?? 0,
        fileCount: snapshot?.tenderDocuments?.length ?? 0,
        stage: (snapshot?.stage ?? 'brons') as Stage,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version])

  const savedTenders = getSavedTenders()
  // Gedownloade aanbestedingen die nog geen eigen project hebben.
  const unlinkedTenders = savedTenders.filter(
    (tender) => !projects.some((project) => project.id === tender.publicatieId),
  )

  const visibleProjects = useMemo(() => {
    const term = filter.trim().toLowerCase()
    if (!term) return projects
    return projects.filter((project) =>
      `${project.title} ${project.buyer} ${project.tendernedId}`.toLowerCase().includes(term),
    )
  }, [filter, projects])

  // Bedrijfskiezer: alle werkdata is per bedrijf gescheiden; wisselen herlaadt de pagina.
  const companies = getCompanies()
  const activeCompanyId = getActiveCompanyId()
  const switchCompany = async (id: string) => {
    if (id === activeCompanyId) return
    setActiveCompanyId(id)
    await flushStorage()
    window.location.reload()
  }

  // Oudere links (/?open=<publicatieId>) vanuit de catalogus: maak/open het project en stuur door.
  const openParamHandled = useRef(false)
  useEffect(() => {
    if (openParamHandled.current) return
    const openId = searchParams.get('open')
    if (!openId) return
    openParamHandled.current = true
    const tender = getSavedTenders().find((item) => item.publicatieId === openId)
    if (tender) {
      router.replace(`/projecten/${encodeURIComponent(createProjectFromTender(tender))}`)
    } else {
      router.replace('/')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nieuw project aanmaken via dialoog; daarna direct de projectomgeving openen.
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBuyer, setNewBuyer] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const handleCreate = () => {
    const id = createBlankProject({ title: newTitle, buyer: newBuyer, deadline: newDeadline })
    setCreateOpen(false)
    router.push(`/projecten/${encodeURIComponent(id)}`)
  }

  const openProject = (id: string) => router.push(`/projecten/${encodeURIComponent(id)}`)

  // Hernoemen in de app zelf in plaats van een browserpop-up.
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const startRename = (id: string, currentTitle: string) => {
    setRenameTarget({ id, title: currentTitle })
    setRenameValue(currentTitle)
  }
  const confirmRename = () => {
    if (!renameTarget) return
    renameProject(renameTarget.id, renameValue)
    setRenameTarget(null)
    setVersion((v) => v + 1)
    setStatus('Projectnaam aangepast.')
  }

  // Verwijderen vraagt eerst om bevestiging, mét wat er verdwijnt, en is daarna nog
  // tien seconden terug te draaien.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; details: string[] } | null>(null)
  const startDelete = (project: (typeof projects)[number]) => {
    setDeleteTarget({
      id: project.id,
      title: project.title,
      details: [
        `${project.sourceCount} bron(nen) en ${project.fileCount} bestand(en)`,
        `Stadium: ${stageLabels[project.stage]}`,
        ...(project.buyer ? [`Opdrachtgever: ${project.buyer}`] : []),
      ],
    })
  }
  const confirmDelete = () => {
    if (!deleteTarget) return
    const { id, title } = deleteTarget
    const meta = projects.find((project) => project.id === id)
    // Het volledige dossier vastleggen vóór verwijderen, zodat "Ongedaan maken" alles terugzet.
    const snapshot = loadDossier<DossierSnapshot>(id)
    const restoreMeta: ProjectMeta | null = meta
      ? { id: meta.id, title: meta.title, buyer: meta.buyer, updatedAt: meta.updatedAt, source: meta.source }
      : null
    removeProject(id)
    setDeleteTarget(null)
    setVersion((v) => v + 1)
    setStatus('Project verwijderd.')
    notifyUndo(`Project "${title}" verwijderd`, () => {
      if (snapshot) saveDossier(id, snapshot)
      if (restoreMeta) upsertProject(restoreMeta)
      setVersion((v) => v + 1)
      setStatus('Project teruggezet.')
    })
  }

  const openTenderAsProject = (publicatieId: string) => {
    const tender = getSavedTenders().find((item) => item.publicatieId === publicatieId)
    if (!tender) return
    openProject(createProjectFromTender(tender))
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-[10px]">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
              <PenLine size={20} />
            </div>
            <div className="min-w-0 leading-tight">
              <strong className="block truncate">Bid Writer</strong>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {companies.find((company) => company.id === activeCompanyId)?.name ?? 'Besteed Het Uit'}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={activeCompanyId} onValueChange={(value) => void switchCompany(value)}>
              <SelectTrigger className="w-52 bg-card">
                <SelectValue placeholder="Kies bedrijf…" />
              </SelectTrigger>
              <SelectContent>
                {companies.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button asChild variant="outline" title="Bedrijven beheren of een nieuw bedrijf aanmaken">
              <Link href="/configuratie#bedrijven">
                <Plus size={15} /> <span className="sr-only sm:not-sr-only">Nieuw bedrijf</span>
              </Link>
            </Button>
            <ModeToggle />
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-1.5 px-4 pb-4 sm:px-6">
          {navItems.map(({ href, label, Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-semibold shadow-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <Icon size={14} className="text-primary" /> {label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold">
              <FolderOpen size={20} className="text-primary" /> Projecten
              <Badge variant="secondary">{projects.length}</Badge>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Elk project heeft een eigen omgeving met documenten, bronnen en het concept. Start
              blanco of haal een aanbesteding op uit TenderNed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/aanbestedingen">
                <ScanSearch size={16} /> TenderNed scannen
              </Link>
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <FilePlus2 size={16} /> Nieuw project
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Nieuw project</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-project-title">Projectnaam</Label>
                    <Input
                      id="new-project-title"
                      autoFocus
                      value={newTitle}
                      onChange={(event) => setNewTitle(event.target.value)}
                      placeholder="bijv. Inschrijving schoonmaak gemeente"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleCreate()
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-project-buyer">Opdrachtgever (optioneel)</Label>
                    <Input
                      id="new-project-buyer"
                      value={newBuyer}
                      onChange={(event) => setNewBuyer(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="new-project-deadline">Deadline (optioneel)</Label>
                    <Input
                      id="new-project-deadline"
                      type="date"
                      value={newDeadline}
                      onChange={(event) => setNewDeadline(event.target.value)}
                    />
                  </div>
                  <Button className="w-full" onClick={handleCreate}>
                    <FilePlus2 size={16} /> Project aanmaken en openen
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {status ? <p className="mb-4 text-xs text-muted-foreground">{status}</p> : null}

        {projects.length > 3 ? (
          <div className="relative mb-4 max-w-sm">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Zoek project op naam of opdrachtgever…"
            />
          </div>
        ) : null}

        {visibleProjects.length ? (
          <ul className="grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
            {visibleProjects.map((project) => {
              const updated = formatDate(project.updatedAt, true)
              const deadline = formatDate(project.deadline)
              return (
                <li key={project.id} className="min-w-0">
                  <Card className="h-full transition-colors hover:border-primary/40">
                    <CardContent className="flex h-full flex-col gap-2.5">
                      <button
                        type="button"
                        onClick={() => openProject(project.id)}
                        className="flex min-w-0 items-start gap-2.5 text-left"
                        title="Open project"
                      >
                        <span className="mt-0.5 grid size-8 flex-none place-items-center rounded-md bg-primary/10 text-primary">
                          {project.source === 'tender' ? <FileText size={15} /> : <FilePlus2 size={15} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{project.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {project.buyer || 'Geen opdrachtgever ingevuld'}
                          </span>
                        </span>
                      </button>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                        <Badge variant="secondary" className="rounded-full px-2 py-0 text-[10px] font-normal">
                          {project.source === 'tender' ? 'TenderNed' : 'Eigen project'}
                        </Badge>
                        <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] font-normal">
                          {stageLabels[project.stage]}
                        </Badge>
                        <span>{project.sourceCount} bron(nen)</span>
                        {project.fileCount ? <span>· {project.fileCount} bestand(en)</span> : null}
                      </div>

                      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {deadline ? (
                          <span className="flex items-center gap-1">
                            <CalendarDays size={11} /> deadline {deadline}
                          </span>
                        ) : null}
                        {updated ? (
                          <span className="flex items-center gap-1">
                            <Clock size={11} /> {updated}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-1.5 border-t pt-2.5">
                        <Button size="sm" className="flex-1" onClick={() => openProject(project.id)}>
                          <FolderOpen size={14} /> Openen
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8"
                          title="Hernoem project"
                          aria-label={`Hernoem project ${project.title}`}
                          onClick={() => startRename(project.id, project.title)}
                        >
                          <Pencil size={13} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-8 text-destructive"
                          title="Verwijder project"
                          aria-label={`Verwijder project ${project.title}`}
                          onClick={() => startDelete(project)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </li>
              )
            })}
          </ul>
        ) : (
          <Card>
            <CardContent className="py-10 text-center">
              <FolderOpen size={28} className="mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-semibold">
                {projects.length ? `Geen project gevonden voor “${filter}”.` : 'Nog geen projecten.'}
              </p>
              {!projects.length ? (
                <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
                  Maak een nieuw project aan en voeg je eigen documenten toe, of scan TenderNed en
                  haal een aanbesteding op — die wordt dan direct een project.
                </p>
              ) : null}
            </CardContent>
          </Card>
        )}

        {unlinkedTenders.length ? (
          <section className="mt-8">
            <h2 className="flex items-center gap-2 text-sm font-bold">
              <Import size={16} className="text-primary" /> Gedownloade aanbestedingen zonder project
              <Badge variant="secondary">{unlinkedTenders.length}</Badge>
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Deze aanbestedingen staan in je database maar hebben nog geen projectomgeving.
            </p>
            <ul className="mt-3 grid list-none gap-1.5 p-0">
              {unlinkedTenders.map((tender) => (
                <li key={tender.publicatieId}>
                  <button
                    type="button"
                    onClick={() => openTenderAsProject(tender.publicatieId)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-left text-xs',
                      'transition-colors hover:border-primary/40 hover:bg-primary/5',
                    )}
                  >
                    <span className="grid size-7 flex-none place-items-center rounded-md bg-primary/10 text-primary">
                      <FileText size={14} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{tender.aanbestedingNaam}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {tender.opdrachtgeverNaam} · TN-{tender.kenmerk}
                      </span>
                    </span>
                    <span className="flex flex-none items-center gap-1 font-semibold text-primary">
                      Maak project <ArrowRight size={13} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <Dialog
          open={renameTarget !== null}
          onOpenChange={(open) => {
            if (!open) setRenameTarget(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Project hernoemen</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="rename-project-title">Projectnaam</Label>
              <Input
                id="rename-project-title"
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') confirmRename()
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameTarget(null)}>
                Annuleren
              </Button>
              <Button onClick={confirmRename} disabled={!renameValue.trim()}>
                <Pencil size={15} /> Naam opslaan
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null)
          }}
          title={`Project "${deleteTarget?.title ?? ''}" verwijderen?`}
          description="Het hele dossier verdwijnt: bronnen, concepten, opmerkingen en versies. Je kunt dit tien seconden lang terugdraaien via de melding."
          details={deleteTarget?.details ?? []}
          confirmLabel="Project verwijderen"
          onConfirm={confirmDelete}
        />
      </div>
    </main>
  )
}
