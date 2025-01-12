'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { Clock, LogOut, Trophy, CheckCircle } from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// Initialize Supabase client
const getSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables')
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

let supabase: ReturnType<typeof getSupabase>

interface User {
  id: number
  name: string
  email: string
  timeSpent: number
  isCheckedIn?: boolean
  checkInTime?: number | null
  displayName?: string
}

interface UserMetadata {
  [key: string]: string | number | boolean | null
}

interface AuthUser {
  id: string
  email: string | undefined
  user_metadata?: UserMetadata
}

interface Message {
  type: 'error' | 'success'
  content: string
}

const getRankStyle = (index: number): string => {
  switch(index) {
    case 0: return "bg-yellow-50 dark:bg-yellow-900/20"
    case 1: return "bg-zinc-50 dark:bg-zinc-900/20"
    case 2: return "bg-orange-50 dark:bg-orange-900/20"
    default: return ""
  }
}

const getRankDisplay = (index: number): string => {
  switch(index) {
    case 0: return "1st"
    case 1: return "2nd"
    case 2: return "3rd"
    default: return `${index + 1}th`
  }
}

const getUserRank = (userId: number, usersList: User[]): number => {
  const sortedUsers = [...usersList].sort((a, b) => b.timeSpent - a.timeSpent)
  const index = sortedUsers.findIndex(user => user.id === userId)
  return index === -1 ? usersList.length : index + 1
}

export default function Home() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [email, setEmail] = useState('')
  const [loggedInUser, setLoggedInUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<Message | null>(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [newDisplayName, setNewDisplayName] = useState('')

  const fetchUsers = useCallback(async () => {
    if (!supabase) return;
    
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('timeSpent', { ascending: false })

      if (error) throw error
      setUsers(data || [])
      
      if (loggedInUser) {
        const updatedUser = data?.find(u => u.id === loggedInUser.id)
        if (updatedUser) {
          setLoggedInUser(updatedUser)
        }
      }
    } catch (error) {
      console.error('Error fetching users:', error)
      setMessage({ type: 'error', content: 'Failed to fetch leaderboard' })
    }
  }, [loggedInUser])

  const handleUserSession = useCallback(async (authUser: AuthUser) => {
    if (!authUser.email) return;
    console.log("Handling user session for:", authUser.email);
    
    try {
      const { data: existingUser, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('email', authUser.email)
        .single()

      if (!fetchError && existingUser) {
        console.log("Found existing user:", existingUser);
        setLoggedInUser(existingUser)
        return
      }

      console.log("Creating new user");
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert([{ 
          email: authUser.email,
          name: authUser.email.split('@')[0],
          timeSpent: 0,
          isCheckedIn: false
        }])
        .select()
        .single()

      if (createError) {
        console.error("Error creating user:", createError);
        throw createError;
      }

      if (newUser) {
        console.log("Created new user:", newUser);
        setLoggedInUser(newUser)
      }
    } catch (error) {
      console.error('Error handling user session:', error)
      setMessage({ type: 'error', content: 'Failed to load user data' })
    }
  }, [])

  const handleUpdateDisplayName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase || !loggedInUser || !newDisplayName.trim()) return
    setMessage(null)

    try {
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ 
          display_name: newDisplayName.trim()
        })
        .eq('id', loggedInUser.id)
        .select()
        .single()

      if (updateError) throw updateError

      if (data) {
        setLoggedInUser({ ...loggedInUser, displayName: newDisplayName.trim() })
        setIsEditingName(false)
        setNewDisplayName('')
        await fetchUsers()
        setMessage({ 
          type: 'success', 
          content: 'Display name updated successfully!' 
        })
      }
    } catch (error) {
      console.error('Error updating display name:', error)
      setMessage({ 
        type: 'error', 
        content: 'Failed to update display name. Please try again.' 
      })
    }
  }

  useEffect(() => {
    try {
      supabase = getSupabase()
      fetchUsers()

      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user?.email) {
          handleUserSession({
            id: session.user.id,
            email: session.user.email,
            user_metadata: session.user.user_metadata
          })
        }
        setIsLoading(false)
      })

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user?.email) {
          handleUserSession({
            id: session.user.id,
            email: session.user.email,
            user_metadata: session.user.user_metadata
          })
        } else {
          setLoggedInUser(null)
        }
      })

      return () => subscription.unsubscribe()
    } catch (error) {
      console.error('Failed to initialize Supabase:', error)
      setMessage({ type: 'error', content: 'Failed to initialize application' })
      setIsLoading(false)
    }
  }, [handleUserSession, fetchUsers])

  useEffect(() => {
    const intervalId = setInterval(fetchUsers, 5000)
    return () => clearInterval(intervalId)
  }, [fetchUsers])

  const handleCheckIn = async () => {
    if (!supabase || !loggedInUser) return
    setMessage(null)

    try {
      const now = Date.now()
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ 
          isCheckedIn: true, 
          checkInTime: now,
          timeSpent: loggedInUser.timeSpent
        })
        .eq('id', loggedInUser.id)
        .select()
        .single()

      if (updateError) throw updateError

      if (data) {
        setLoggedInUser({ ...data, checkInTime: now, isCheckedIn: true })
        await fetchUsers()
        setMessage({ 
          type: 'success', 
          content: 'Successfully checked in!' 
        })
      }
    } catch (error) {
      console.error('Error checking in:', error)
      setMessage({ 
        type: 'error', 
        content: 'Failed to check in. Please try again.' 
      })
    }
  }

  const handleCheckOut = async () => {
    if (!supabase || !loggedInUser?.checkInTime) return
    setMessage(null)

    try {
      const now = Date.now()
      const timeElapsed = Math.floor((now - loggedInUser.checkInTime) / 60000)
      const newTotalTime = loggedInUser.timeSpent + timeElapsed
      
      const { data, error: updateError } = await supabase
        .from('users')
        .update({ 
          isCheckedIn: false,
          timeSpent: newTotalTime,
          checkInTime: null
        })
        .eq('id', loggedInUser.id)
        .select()
        .single()

      if (updateError) throw updateError

      if (data) {
        setLoggedInUser({
          ...data,
          isCheckedIn: false,
          timeSpent: newTotalTime,
          checkInTime: null
        })
        await fetchUsers()
        setMessage({ 
          type: 'success', 
          content: `Successfully checked out! Added ${timeElapsed} minutes.` 
        })
      }
    } catch (error) {
      console.error('Error checking out:', error)
      setMessage({ 
        type: 'error', 
        content: 'Failed to check out. Please try again.' 
      })
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    
    if (!supabase) {
      setMessage({ type: 'error', content: 'Application not properly initialized' })
      return
    }
  
    if (!email.endsWith('@berkeley.edu')) {
      setMessage({ type: 'error', content: 'Please use a valid Berkeley email address' })
      return
    }
  
    try {
      const { data, error: signInError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: 'https://moffit-leaderboard.vercel.app/auth/callback',
          shouldCreateUser: true,
        },
      })
  
      if (signInError) throw signInError
  
      if (data) {
        setEmail('')
        setMessage({ 
          type: 'success', 
          content: '✨ Magic link sent! Check your email to log in.' 
        })
      }
    } catch (error) {
      console.error('Error during login:', error)
      if (error && typeof error === 'object' && 'message' in error) {
        setMessage({ 
          type: 'error', 
          content: (error as { message: string }).message 
        })
      } else {
        setMessage({ 
          type: 'error', 
          content: 'Failed to send login link. Please try again.' 
        })
      }
    }
  }

  const handleSignOut = async () => {
    if (!supabase) return
    
    try {
      await supabase.auth.signOut()
      setLoggedInUser(null)
      router.refresh()
    } catch (error) {
      console.error('Error signing out:', error)
      setMessage({ type: 'error', content: 'Failed to sign out' })
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <main className="container mx-auto p-6 max-w-5xl">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-6 w-6" />
            MoffittBoard
          </CardTitle>
          <CardDescription>Track your study time at Moffitt Library</CardDescription>
        </CardHeader>
      </Card>
      
      {message && (
        <Alert 
          variant={message.type === 'error' ? 'destructive' : 'default'} 
          className={`mb-6 ${
            message.type === 'success' 
              ? 'bg-green-500/20 text-green-500 border-green-500' 
              : ''
          }`}
        >
          {message.type === 'success' && <CheckCircle className="h-4 w-4 mr-2" />}
          <AlertDescription className="font-medium">
            {message.content}
          </AlertDescription>
        </Alert>
      )}
      
      <div className="grid gap-6 md:grid-cols-2">
        {/* Leaderboard Card - Always visible */}
        <Card>
          <CardHeader>
            <CardTitle>Current Rankings</CardTitle>
            <CardDescription>Top students by study time</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Time (min)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users
                  .sort((a, b) => b.timeSpent - a.timeSpent)
                  .map((user, index) => (
                    <TableRow
                      key={user.id}
                      className={`${
                        loggedInUser?.id === user.id 
                          ? 'bg-blue-50 dark:bg-blue-900/20' 
                          : ''
                      } ${index < 3 ? getRankStyle(index) : ''}`}
                    >
                      <TableCell className="font-medium">
                        {getRankDisplay(index)}
                      </TableCell>
                      <TableCell>{user.displayName || user.name}</TableCell>
                      <TableCell>{user.timeSpent}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Login/User Card */}
        <Card>
          {!loggedInUser ? (
            <>
              <CardHeader>
                <CardTitle>Login to Track Time</CardTitle>
                <CardDescription>
                  Sign in with your Berkeley email to start tracking your study time
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@berkeley.edu"
                    pattern=".+@berkeley\.edu"
                    required
                  />
                  <Button type="submit">
                    Send Magic Link
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {isEditingName ? (
                    <form 
                      onSubmit={handleUpdateDisplayName}
                      className="flex w-full gap-2"
                    >
                      <Input
                        value={newDisplayName}
                        onChange={(e) => setNewDisplayName(e.target.value)}
                        placeholder="Enter display name"
                        className="max-w-[200px]"
                        autoFocus
                        required
                      />
                      <Button type="submit" size="sm">
                        Save
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setIsEditingName(false)
                          setNewDisplayName('')
                        }}
                      >
                        Cancel
                      </Button>
                    </form>
                  ) : (
                    <>
                      <span>Welcome, {loggedInUser.displayName || loggedInUser.name}!</span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setIsEditingName(true)
                          setNewDisplayName(loggedInUser.displayName || loggedInUser.name)
                        }}
                      >
                        Edit Name
                      </Button>
                    </>
                  )}
                </CardTitle>
                <CardDescription>
                  Rank #{getUserRank(loggedInUser.id, users)}
                  {getUserRank(loggedInUser.id, users) > 10 ? 
                    ` (out of ${users.length})` : 
                    ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Total time: {loggedInUser.timeSpent} minutes</span>
                </div>
                <div className="flex gap-2">
                  {loggedInUser.isCheckedIn ? (
                    <Button 
                      variant="destructive"
                      onClick={handleCheckOut}
                    >
                      Check Out
                    </Button>
                  ) : (
                    <Button 
                      variant="default"
                      onClick={handleCheckIn}
                    >
                      Check In
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={handleSignOut}
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  )
}