const dbQueue = []
const consumeNext = () => {
  const next = dbQueue.shift()
  return Promise.resolve(next ?? { data: null, error: null })
}

const chain = {
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  single: jest.fn().mockImplementation(consumeNext),
  then(resolve, reject) { return consumeNext().then(resolve, reject) },
}

export const supabaseAdmin = {
  from: jest.fn().mockReturnValue(chain),
  __chain: chain,
}

export const supabase = {
  auth: {
    getUser: jest.fn().mockResolvedValue({
      data: { user: null },
      error: { message: 'no auth' },
    }),
  },
}