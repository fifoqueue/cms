<script lang="ts">
  import { enhance } from '$app/forms';
  import FormMessage from '#lib/admin/FormMessage.svelte';
  import { Button } from '#lib/components/ui/button/index.js';
  import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
  } from '#lib/components/ui/card/index.js';
  import { Input } from '#lib/components/ui/input/index.js';
  import { Label } from '#lib/components/ui/label/index.js';
  import type { PageProps } from './$types';

  let { data, form }: PageProps = $props();
  let pending = $state(false);
</script>

<svelte:head><title>사이트 설치</title></svelte:head>

<Card>
  <CardHeader>
    <CardTitle>새 사이트를 시작하세요</CardTitle>
    <CardDescription>
      {data.databaseConfigured
        ? '2 / 2 · 사이트와 관리자 설정'
        : '1 / 2 · 데이터베이스 연결'}
    </CardDescription>
  </CardHeader>
  <CardContent>
    <form
      method="POST"
      action={data.databaseConfigured ? '?/complete' : '?/database'}
      use:enhance={() => {
        pending = true;
        return async ({ update }) => {
          try {
            await update();
          } finally {
            pending = false;
          }
        };
      }}
      class="space-y-4"
    >
      <FormMessage {form} />
      <fieldset disabled={pending} class="space-y-4">
        {#if !data.databaseConfigured || !data.hasKey}
          <div class="grid gap-2">
            <Label for="token">설치 키</Label>
            <Input
              id="token"
              name="token"
              type="password"
              autocomplete="off"
              required
            />
            <p class="text-xs text-muted-foreground">
              API 서버를 실행한 콘솔에 표시된 설치 키를 입력하세요. 서버를
              재시작하면 키가 바뀝니다.
            </p>
          </div>
        {:else}
          <details class="text-sm">
            <summary class="cursor-pointer"
              >서버를 재시작했나요? 새 설치 키 입력</summary
            >
            <Input
              name="token"
              type="password"
              aria-label="새 설치 키"
              autocomplete="off"
              class="mt-2"
            />
          </details>
        {/if}
        {#if !data.databaseConfigured}
          <p class="text-sm text-muted-foreground">
            사용할 데이터베이스의 접속 정보를 입력하세요.
          </p>
          <div class="grid grid-cols-[1fr_6rem] gap-3">
            <div class="grid gap-2">
              <Label for="host">DB 호스트</Label>
              <Input
                id="host"
                name="host"
                value={form?.databaseValues?.host ?? 'localhost'}
                required
              />
            </div>
            <div class="grid gap-2">
              <Label for="port">포트</Label>
              <Input
                id="port"
                name="port"
                type="number"
                min={1}
                max={65535}
                value={form?.databaseValues?.port ?? 3306}
                required
              />
            </div>
          </div>
          <div class="grid gap-2">
            <Label for="database">데이터베이스 이름</Label>
            <Input
              id="database"
              name="database"
              value={form?.databaseValues?.database ?? ''}
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="username">DB 사용자</Label>
            <Input
              id="username"
              name="username"
              autocomplete="off"
              value={form?.databaseValues?.username ?? ''}
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="password">DB 비밀번호</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autocomplete="off"
            />
          </div>
        {:else}
          <p class="text-sm text-muted-foreground">
            데이터베이스가 준비되었습니다. 사이트 정보는 설치 후 관리자 설정에서
            변경할 수 있습니다.
          </p>
          <div class="grid gap-2">
            <Label for="title">사이트 제목</Label>
            <Input
              id="title"
              name="title"
              maxlength={191}
              value={form?.siteValues?.title ?? ''}
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="description">사이트 설명</Label>
            <Input
              id="description"
              name="description"
              maxlength={500}
              value={form?.siteValues?.description ?? ''}
            />
          </div>
          <div class="grid gap-2">
            <Label for="locale">사이트 언어</Label>
            <select
              id="locale"
              name="locale"
              class="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={form?.siteValues?.locale ?? 'ko'}
            >
              <option value="ko">한국어</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>
          <div class="grid gap-2">
            <Label for="name">관리자 이름</Label>
            <Input
              id="name"
              name="name"
              autocomplete="name"
              value={form?.siteValues?.name ?? ''}
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="email">관리자 이메일</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autocomplete="username"
              value={form?.siteValues?.email ?? ''}
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="password">관리자 비밀번호</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autocomplete="new-password"
              minlength={8}
              maxlength={200}
              required
            />
          </div>
          <div class="grid gap-2">
            <Label for="confirmation">비밀번호 확인</Label>
            <Input
              id="confirmation"
              name="confirmation"
              type="password"
              autocomplete="new-password"
              minlength={8}
              maxlength={200}
              required
            />
          </div>
        {/if}
        <Button type="submit" class="w-full">
          {pending
            ? '설정 적용 중…'
            : data.databaseConfigured
              ? '설치 완료하고 시작하기'
              : '연결 확인 및 테이블 준비'}
        </Button>
      </fieldset>
      {#if pending}
        <p class="text-xs text-muted-foreground" role="status">
          설치를 진행하고 있습니다. 잠시 기다려 주세요.
        </p>
      {/if}
    </form>
  </CardContent>
</Card>
