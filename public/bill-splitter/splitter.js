// Pure split math. No DOM, no side effects.
//
// Inputs:
//   items: [{ id, name, price, assignees: Set<participantId> | participantId[] }]
//   fees:  [{ id, type: 'tax'|'tip'|'service'|'discount'|'other', amount, label }]
//   participants: [{ id, name }]
//
// Item price is split equally among the item's assignees.
// Fees of type 'tax'|'tip'|'service' are distributed proportionally to each
// participant's item subtotal. 'discount' is also proportional (negative-friendly).
// 'other' fees are NOT auto-distributed and are reported separately.
// Items with zero assignees count as "unassigned" and surface in the result.

const PROPORTIONAL_FEE_TYPES = new Set(['tax', 'tip', 'service', 'discount']);

function asArray(assignees) {
    if (!assignees) return [];
    if (assignees instanceof Set) return [...assignees];
    return [...assignees];
}

export function computeTotals({ items = [], fees = [], participants = [] } = {}) {
    const perParticipant = new Map();
    for (const p of participants) {
        perParticipant.set(p.id, {
            participantId: p.id,
            name: p.name,
            subtotal: 0,
            feeShares: {},
            total: 0,
            itemIds: [],
        });
    }

    const unassignedItems = [];
    let assignedSubtotal = 0;

    for (const item of items) {
        const assignees = asArray(item.assignees).filter((id) => perParticipant.has(id));
        if (assignees.length === 0) {
            unassignedItems.push(item);
            continue;
        }
        const share = item.price / assignees.length;
        for (const id of assignees) {
            const row = perParticipant.get(id);
            row.subtotal += share;
            row.itemIds.push(item.id);
        }
        assignedSubtotal += item.price;
    }

    const proportionalFees = [];
    const standaloneFees = [];
    for (const fee of fees) {
        if (PROPORTIONAL_FEE_TYPES.has(fee.type)) {
            proportionalFees.push(fee);
        } else {
            standaloneFees.push(fee);
        }
    }

    for (const fee of proportionalFees) {
        if (assignedSubtotal <= 0) {
            // No assignments yet — fee can't be distributed proportionally.
            // Leave it on the standalone list so the UI can show it pending.
            standaloneFees.push({ ...fee, _pending: true });
            continue;
        }
        for (const row of perParticipant.values()) {
            const ratio = row.subtotal / assignedSubtotal;
            const share = fee.amount * ratio;
            row.feeShares[fee.type] = (row.feeShares[fee.type] || 0) + share;
        }
    }

    for (const row of perParticipant.values()) {
        const feesSum = Object.values(row.feeShares).reduce((a, b) => a + b, 0);
        row.total = row.subtotal + feesSum;
    }

    const grandTotal = [...perParticipant.values()].reduce((a, r) => a + r.total, 0);

    return {
        perParticipant: [...perParticipant.values()],
        unassignedItems,
        standaloneFees,
        assignedSubtotal,
        grandTotal,
    };
}

export function formatCurrency(amount, locale = 'en-US', currency = 'USD') {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}
