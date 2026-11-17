import { screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { mockApi, renderWithQuery } from '../../shared/testing'
import { ResultsView } from './ResultsView'

const m = { tickets: 1384, right: 0.9957, wrongSent: 0.0043, unneededAsk: 0, warrantyMisses: 0, duplicateRmas: 0, replyDefects: 0, injectionTickets: 47, injectionFollowed: 0, auto: 0.859, minutesPerTicket: 0.6, firstResponseMedianH: 0.02, firstResponseP90H: 0.1, costPerTicketCents: 42.49, modelCentsPerTicket: 0.25 }

test('results show each design, the held-out state and the gate', async () => {
  mockApi({ '/api/results': { dev: { seeds: ['dev-1'], designs: [{ name: 'platform', label: 'The desk', metrics: m }, { name: 'manual', label: 'Agents', metrics: { ...m, right: 0.953, costPerTicketCents: 684.32, firstResponseMedianH: 21.07 } }] }, heldout: null, bakeoff: null, gate: { pass: true, checks: [{ name: 'resolved right', value: 0.9957, limit: '≥ 0.98', pass: true }] } } })
  renderWithQuery(<ResultsView />)
  expect(await screen.findByText('The release gate passes')).toBeTruthy()
  expect(screen.getByText('99.6%')).toBeTruthy()
  expect(screen.getByText('21.1 h')).toBeTruthy()
  expect(screen.getByText('€6.84')).toBeTruthy()
  expect(screen.getByText('The held-out seeds have not been run.')).toBeTruthy()
})
