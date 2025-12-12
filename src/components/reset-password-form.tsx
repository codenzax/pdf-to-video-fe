import React from 'react'
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useHandleResetPassword } from '@/hooks/useAuthFlow'
import { useSearchParams } from 'react-router-dom'

export function ResetPasswordForm({ className, ...props }: Omit<React.ComponentProps<'div'>, 'onSubmit'>) {
  const { submit, isLoading } = useHandleResetPassword()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const newPassword = String(fd.get('newPassword') || '')
    const confirmNewPassword = String(fd.get('confirmNewPassword') || '')
    if (newPassword !== confirmNewPassword) {
      // Lightweight validation; full toast handled in hook if desired
      return
    }
    submit(token, newPassword)
  }

  return (
    <div className={className} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Reset password</CardTitle>
          <CardDescription>Enter your new password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <Input id="newPassword" name="newPassword" type="password" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirmNewPassword">Confirm new password</FieldLabel>
                <Input id="confirmNewPassword" name="confirmNewPassword" type="password" required />
                <FieldDescription>Both passwords must match.</FieldDescription>
              </Field>
              <Field>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Resetting...' : 'Reset password'}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}


