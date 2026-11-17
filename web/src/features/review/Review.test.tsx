import { fireEvent, screen, waitFor } from '@testing-library/react'
import { expect, test } from 'vitest'
import { mockApi, renderWithQuery } from '../../shared/testing'
import { ReviewView } from './ReviewView'

const row = { message_id: '<b@x>', thread_id: '<b@x>', received_at: '2026-10-05T09:12:00Z', sender: 'hugo.lefebvre@mail.example', country: 'FR', subject: 'Demande de garantie', lang: 'fr', intent: 'warranty', resolution: { kind: 'deny', reason: 'expired' }, route: 'review', status: 'waiting', reason: 'deny needs a person\'s approval', rma_number: null }

test('a waiting draft is approved by a person, with their name', async () => {
  const calls = mockApi({ '/api/tickets?status=waiting': [row], '/api/tickets/%3Cb%40x%3E': { ...row, reply: 'Bonjour Hugo, malheureusement la garantie a pris fin le 03/04/2026.', trace: [] }, '/api/tickets/%3Cb%40x%3E/approve': { status: 'approved' } })
  renderWithQuery(<ReviewView />)
  expect(await screen.findByText(/la garantie a pris fin/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Approve and send' }))
  await waitFor(() => expect(calls.some((c) => c.url.endsWith('/approve') && c.init?.method === 'POST' && String(c.init.body).includes('"by"'))).toBe(true))
})

test('no drafts waiting is a plain statement, not a blank page', async () => {
  mockApi({ '/api/tickets?status=waiting': [] })
  renderWithQuery(<ReviewView />)
  expect(await screen.findByText('No drafts waiting')).toBeTruthy()
})
