'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client
const getSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

// Initialize Supabase client lazily
let supabase: ReturnType<typeof getSupabase>

interface User {
  id: number
  name: string
  email: string
  timeSpent: number
  isCheckedIn?: boolean
  checkInTime?: number
}

const getRankStyle = (index: number): string => {
  switch(index) {
    case 0: return "bg-yellow-100";
    case 1: return "bg-gray-100";
    case 2: return "bg-orange-100";
    default: return "";
  }
};

const getRankDisplay = (index: number): string => {
  switch(index) {
    case 0: return "1st";
    case 1: return "2nd";
    case 2: return "3rd";
    default: return `${index + 1}th`;
  }
};

export default function Home() {
  const [users, setUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())

  // Initialize Supabase on component mount
  useEffect(() => {
    try {
      supabase = getSupabase()
    } catch (error) {
      console.error('Failed to initialize Supabase:', error)
      setError('Failed to initialize application')
      setIsLoading(false)
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    if (!supabase) {
      setError('Application not initialized')
      return
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .order('timeSpent', { ascending: false })
      
      if (fetchError) {
        throw fetchError
      }
      
      if (data) {
        setUsers(data)
        if (loggedInUser) {
          const updatedUser = data.find(u => u.id === loggedInUser.id)
          if (updatedUser) {
            setLoggedInUser(updatedUser)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      setError('Failed to fetch users. Please refresh the page.')
    } finally {
      setIsLoading(false)
    }
  }, [loggedInUser])

  useEffect(() => {
    if (!supabase) return

    // Initial fetch
    fetchUsers()

    // Set up real-time subscription
    const channel = supabase.channel('users_db_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
          filter: 'isCheckedIn=eq.true'
        },
        (payload) => {
          console.log('Change received:', payload)
          if (payload.eventType === 'UPDATE') {
            setUsers(prevUsers => {
              const updatedUsers = [...prevUsers]
              const index = updatedUsers.findIndex(u => u.id === payload.new.id)
              if (index !== -1) {
                updatedUsers[index] = payload.new as User
              } else {
                updatedUsers.push(payload.new as User)
              }
              return updatedUsers.sort((a, b) => b.timeSpent - a.timeSpent)
            })
          } else if (payload.eventType === 'INSERT') {
            setUsers(prevUsers => {
              return [...prevUsers, payload.new as User]
                .sort((a, b) => b.timeSpent - a.timeSpent)
            })
          } else if (payload.eventType === 'DELETE') {
            setUsers(prevUsers => 
              prevUsers.filter(user => user.id !== payload.old.id)
                .sort((a, b) => b.timeSpent - a.timeSpent)
            )
          }
        }
      )
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Successfully subscribed to real-time changes')
        }
      })

    return () => {
      channel.unsubscribe()
    }
  }, [fetchUsers])

  // Update time spent for checked-in user
  useEffect(() => {
    let intervalId: NodeJS.Timeout

    const updateTime = async () => {
      if (!supabase || !loggedInUser?.isCheckedIn || !loggedInUser?.checkInTime) return

      const now = Date.now()
      const timeSinceLastUpdate = Math.floor((now - lastUpdateTime) / 60000) // Minutes since last update

      if (timeSinceLastUpdate < 1) return // Only update if at least a minute has passed

      try {
        const { error: updateError } = await supabase
          .from('users')
          .update({ 
            timeSpent: loggedInUser.timeSpent + timeSinceLastUpdate
          })
          .eq('id', loggedInUser.id)

        if (updateError) {
          throw updateError
        }

        // Update local state
        setLoggedInUser(prev => prev ? {
          ...prev,
          timeSpent: prev.timeSpent + timeSinceLastUpdate
        } : null)
        
        setLastUpdateTime(now)
        
        // Fetch updated user list
        fetchUsers()
      } catch (error) {
        console.error('Error updating time:', error)
        setError('Failed to update time. Your progress will be saved when connection is restored.')
      }
    }

    if (loggedInUser?.isCheckedIn) {
      intervalId = setInterval(updateTime, 60000) // Check every minute
      updateTime() // Initial update
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [loggedInUser, fetchUsers, lastUpdateTime])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    if (!supabase) {
      setError('Application not properly initialized')
      return
    }

    try {
      const name = email.split('@')[0]
      console.log('Attempting login with:', email)

      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select()
        .eq('email', email)
        .single()

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Error fetching user:', fetchError)
        setError(`Login failed: ${fetchError.message}`)
        return
      }

      if (existingUser) {
        console.log('Existing user found:', existingUser)
        setLoggedInUser(existingUser)
      } else {
        console.log('Creating new user with name:', name)
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert([
            { name, email, timeSpent: 0 }
          ])
          .select()
          .single()

        if (insertError) {
          console.error('Error creating user:', insertError)
          setError(`Failed to create account: ${insertError.message}`)
          return
        }

        if (newUser) {
          console.log('New user created:', newUser)
          setLoggedInUser(newUser)
        }
      }
      setEmail('')
    } catch (error) {
      console.error('Unexpected error:', error)
      setError('An unexpected error occurred during login')
    }
  }

  const handleCheckIn = async () => {
    if (!supabase || !loggedInUser) return
    setError(null)

    try {
      const now = Date.now()
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ 
          isCheckedIn: true, 
          checkInTime: now,
          timeSpent: loggedInUser.timeSpent // Preserve existing time
        })
        .eq('id', loggedInUser.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      if (data) {
        setLoggedInUser({ ...data, checkInTime: now })
        setLastUpdateTime(now)
        fetchUsers()
      }
    } catch (error) {
      console.error('Error checking in:', error)
      setError('Failed to check in. Please try again.')
    }
  }

  const handleCheckOut = async () => {
    if (!supabase || !loggedInUser?.checkInTime) return
    setError(null)

    try {
      const now = Date.now()
      const timeElapsed = Math.floor((now - loggedInUser.checkInTime) / 60000)
      
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ 
          isCheckedIn: false,
          timeSpent: loggedInUser.timeSpent + timeElapsed,
          checkInTime: null
        })
        .eq('id', loggedInUser.id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      if (data) {
        setLoggedInUser(data)
        fetchUsers()
      }
    } catch (error) {
      console.error('Error checking out:', error)
      setError('Failed to check out. Please try again.')
    }
  }

  const getUserRank = (userId: number) => {
    return users.findIndex(user => user.id === userId) + 1
  }

  if (isLoading) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="text-white text-center">Loading...</div>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-8 text-white">Moffit Library Leaderboard</h1>
      
      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}
      
      {!loggedInUser ? (
        <div className="mb-8">
          <h2 className="text-xl mb-4 text-white">Login with Berkeley Email</h2>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@berkeley.edu"
              pattern=".+@berkeley\.edu"
              required
              className="w-full max-w-md px-4 py-2 border rounded text-black"
            />
            <button 
              type="submit"
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Login
            </button>
          </form>
        </div>
      ) : (
        <div className="mb-8 p-4 bg-white rounded shadow-lg">
          <p className="mb-4 text-black">Welcome, {loggedInUser.name}!</p>
          <p className="mb-4 text-black">
            Your current rank: {getUserRank(loggedInUser.id)}
            {getUserRank(loggedInUser.id) > 10 ? ` (${getUserRank(loggedInUser.id)} out of ${users.length})` : ''}
          </p>
          {loggedInUser.isCheckedIn ? (
            <button 
              onClick={handleCheckOut}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Check Out
            </button>
          ) : (
            <button 
              onClick={handleCheckIn}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
            >
              Check In
            </button>
          )}
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4 text-white">Current Rankings</h2>
        <div className="bg-white rounded-lg overflow-hidden shadow-lg">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-black">Rank</th>
                <th className="px-6 py-3 text-left text-black">Name</th>
                <th className="px-6 py-3 text-left text-black">Time (minutes)</th>
              </tr>
            </thead>
            <tbody>
              {users
                .sort((a, b) => b.timeSpent - a.timeSpent)
                .map((user, index) => (
                  <tr 
                    key={user.id}
                    className={`border-t ${loggedInUser?.id === user.id ? 'bg-blue-50' : ''}
                      ${index < 3 ? getRankStyle(index) : ''}`}
                  >
                    <td className="px-6 py-4 text-black">
                      {getRankDisplay(index)}
                    </td>
                    <td className="px-6 py-4 text-black">{user.name}</td>
                    <td className="px-6 py-4 text-black">{user.timeSpent}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}