import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { mockApi, renderWithQuery } from '../../shared/testing'
import { InboxView } from './InboxView'
import { ReplyWithSources } from './ReplyWithSources'

const row = { message_id: '<a@x>', thread_id: '<a@x>', received_at: '2026-10-05T09:12:00Z', sender: 'lena.fischer@mail.example', country: 'DE', subject: 'Frage zur Kompatibilität', lang: 'de', intent: 'compatibility', resolution: { kind: 'compat', verdict: 'does_not_fit', reason: 'height' }, route: 'auto', status: 'sent', reason: 'rule height', rma_number: null }
const trace = [
  { node: 'read', note: 'language de' },
  { node: 'decide', note: 'does_not_fit by rules height (failed: height)', refs: ['pim:SM-HP5.cooler.heightMm=168', 'pim:SM-NK400.case.maxCoolerMm=134'] },
  { node: 'route', note: 'sent to the customer' },
]

describe('inbox', () => {
  test('lists tickets, opens one and shows its decision trace', async () => {
    mockApi({ '/api/tickets': [row], '/api/tickets/*': { ...row, body: 'Passt der Hush Tower Pro 5 in das Nook 400?', attachments: [], reply: 'Kühlerhöhe 168 mm, Gehäuse 134 mm.', checks: { ok: true, problems: [] }, drafts: 1, trace, decided_by: null, decided_at: null } })
    renderWithQuery(<InboxView />)
    fireEvent.click(await screen.findByRole('button', { name: /Lena Fischer/ }))
    expect(await screen.findByText(/Passt der Hush Tower Pro 5/)).toBeTruthy()
    expect(screen.getAllByText('Does not fit: height').length).toBeGreaterThan(0)
    expect(screen.getByText('pim:SM-HP5.cooler.heightMm=168')).toBeTruthy()
  })
  test('an empty filter says what will appear, a failure says how to recover', async () => {
    mockApi({ '/api/tickets': [] })
    renderWithQuery(<InboxView />)
    expect(await screen.findByText('Nothing here')).toBeTruthy()
    mockApi({})
    fireEvent.click(screen.getByRole('button', { name: 'Sent' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/The desk is down/))
  })
})

test('every number in the reply links to the field it came from', () => {
  const { container } = renderWithQuery(<ReplyWithSources reply="Kühlerhöhe 168 mm, Gehäuse 134 mm, Rücksendenummer RMA-7000001." trace={[...trace, { node: 'act', note: 'SAP: created RMA-7000001' }]} />)
  const marks = [...container.querySelectorAll('mark')].map((m) => [m.textContent, m.getAttribute('title')])
  expect(marks).toEqual([
    ['168', 'pim:SM-HP5.cooler.heightMm=168'],
    ['134', 'pim:SM-NK400.case.maxCoolerMm=134'],
    ['RMA-7000001', 'sap:SAP: created RMA-7000001'],
  ])
})
