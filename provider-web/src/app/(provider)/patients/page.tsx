"use client"

import Link from "next/link"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table"
import { useMemo, useState } from "react"
import { ArrowUpDown, Lock, AlertTriangle, Plus, Users } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatRelativeKo } from "@/lib/format"
import { PROGRAM_STATUS_LABELS } from "@/lib/safety"
import { usePatients } from "@/lib/queries"

type Patient = {
  patient_id: string
  name: string
  current_week: number
  sobriety_days: number
  last_active_at: string
  program_status: "active" | "completed" | "withdrawn"
  llm_locked: boolean
  unacknowledged_safety_events: number
}

const columns: ColumnDef<Patient>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <SortHeader column={column} label="환자명" />,
    cell: ({ row }) => (
      <Link
        href={`/patients/${row.original.patient_id}`}
        className="text-foreground hover:text-primary inline-flex items-center gap-2 font-medium transition-colors"
      >
        <span className="bg-accent text-accent-foreground inline-flex size-7 items-center justify-center rounded-full text-xs">
          {String(row.getValue("name")).slice(0, 1)}
        </span>
        {row.getValue("name") as string}
      </Link>
    ),
  },
  {
    accessorKey: "current_week",
    header: ({ column }) => <SortHeader column={column} label="Week" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        <span className="text-foreground text-base font-semibold">
          {row.getValue("current_week") as number}
        </span>
        <span className="text-xs"> / 12</span>
      </span>
    ),
  },
  {
    accessorKey: "sobriety_days",
    header: ({ column }) => <SortHeader column={column} label="단주 일수" />,
    cell: ({ row }) => (
      <span className="text-gradient text-lg font-bold">
        {row.getValue("sobriety_days") as number}
        <span className="text-muted-foreground ml-0.5 text-xs font-normal">
          일
        </span>
      </span>
    ),
  },
  {
    accessorKey: "last_active_at",
    header: ({ column }) => <SortHeader column={column} label="마지막 활동" />,
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {formatRelativeKo(row.getValue("last_active_at") as string)}
      </span>
    ),
  },
  {
    accessorKey: "program_status",
    header: "상태",
    cell: ({ row }) => {
      const s = row.getValue<Patient["program_status"]>("program_status")
      return (
        <Badge
          variant={
            s === "active"
              ? "default"
              : s === "completed"
                ? "secondary"
                : "outline"
          }
          className="rounded-full"
        >
          {PROGRAM_STATUS_LABELS[s]}
        </Badge>
      )
    },
  },
  {
    id: "flags",
    header: "주의",
    cell: ({ row }) => {
      const p = row.original
      return (
        <div className="flex items-center gap-2">
          {p.llm_locked && (
            <Badge variant="destructive" className="gap-1 rounded-full">
              <Lock className="size-3" /> 잠금
            </Badge>
          )}
          {p.unacknowledged_safety_events > 0 && (
            <Badge
              variant="outline"
              className="border-destructive/40 text-destructive gap-1 rounded-full"
            >
              <AlertTriangle className="size-3" />
              안전 {p.unacknowledged_safety_events}
            </Badge>
          )}
        </div>
      )
    },
  },
]

function SortHeader<T>({
  column,
  label,
}: {
  column: {
    toggleSorting: (asc?: boolean) => void
    getIsSorted: () => false | "asc" | "desc"
  }
  label: string
}) {
  return (
    <button
      type="button"
      className="hover:text-foreground inline-flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wide"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="size-3 opacity-50" />
    </button>
  )
}

export default function PatientsPage() {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "last_active_at", desc: true },
  ])
  const { data, isLoading, isError } = usePatients()

  const table = useReactTable({
    data: data?.items ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const stats = useMemo(() => {
    const items = data?.items ?? []
    return {
      total: items.length,
      active: items.filter((p) => p.program_status === "active").length,
      locked: items.filter((p) => p.llm_locked).length,
      flagged: items.reduce(
        (acc, p) => acc + (p.unacknowledged_safety_events > 0 ? 1 : 0),
        0,
      ),
    }
  }, [data])

  return (
    <div className="grid gap-8">
      {/* Hero */}
      <header className="ring-glow relative overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-500/10 via-violet-500/5 to-fuchsia-500/10 p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-widest">
              D2 · 환자 관리
            </p>
            <h2 className="mt-1 text-3xl font-bold tracking-tight">
              오늘의 <span className="text-gradient">담당 환자</span>
            </h2>
            <p className="text-muted-foreground mt-2 text-sm">
              마지막 활동 순 정렬. 행을 클릭해 상세 대시보드로 이동하세요.
            </p>
          </div>
          <Link
            href="/patients/new"
            className={`${buttonVariants({ size: "lg" })} rounded-full`}
          >
            <Plus className="size-4" /> 신규 환자 등록
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon="👥" label="총원" value={stats.total} />
          <Stat icon="✅" label="진행 중" value={stats.active} />
          <Stat icon="🔒" label="LLM 잠금" value={stats.locked} tone="warn" />
          <Stat
            icon="🚨"
            label="안전 플래그"
            value={stats.flagged}
            tone="danger"
          />
        </div>
      </header>

      {/* Table */}
      <Card className="ring-glow overflow-hidden rounded-3xl border-0">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/40 hover:bg-muted/40">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className="py-3">
                    {h.isPlaceholder
                      ? null
                      : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j} className="py-4">
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-destructive py-10 text-center"
                >
                  환자 목록을 불러오지 못했습니다.
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground py-12 text-center"
                >
                  <Users className="mx-auto mb-2 size-6 opacity-50" />
                  담당 환자가 없습니다. D0에서 신규 환자를 등록하세요.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="hover:bg-accent/40 transition-colors"
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-4">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: string
  label: string
  value: number
  tone?: "warn" | "danger"
}) {
  return (
    <div className="bg-card/70 rounded-2xl border p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-xl">{icon}</span>
        <span
          className={`text-2xl font-bold tabular-nums ${
            tone === "danger"
              ? "text-destructive"
              : tone === "warn"
                ? "text-amber-600"
                : "text-foreground"
          }`}
        >
          {value}
        </span>
      </div>
      <p className="text-muted-foreground mt-1 text-xs font-medium">{label}</p>
    </div>
  )
}
