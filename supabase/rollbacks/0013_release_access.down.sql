-- Destructive inverse: export grants/invitations before an explicitly approved rollback.
begin;
drop function public.issue_inffyn_invitation(uuid,text,text,text);
drop function public.redeem_inffyn_invitation(uuid,text);
drop function public.revoke_inffyn_invitation(uuid,uuid);
drop function public.ensure_inffyn_workspace(text);
drop function public.consume_inffyn_quota(text,integer);
drop table public.inffyn_access_events;
drop table public.inffyn_access_grants;
drop table public.inffyn_invitations;
drop table public.inffyn_access_admins;
commit;
