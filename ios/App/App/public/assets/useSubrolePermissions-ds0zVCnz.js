import{r as d}from"./vendor-i18n-BJoeY8in.js";import{u}from"./vendor-query-BBZgVvHg.js";import{s as l,aw as r}from"./index-DlruBUhV.js";(function(){try{var s=typeof window<"u"?window:typeof global<"u"?global:typeof globalThis<"u"?globalThis:typeof self<"u"?self:{};s.SENTRY_RELEASE={id:"development"};var e=new s.Error().stack;e&&(s._sentryDebugIds=s._sentryDebugIds||{},s._sentryDebugIds[e]="a2788feb-0aba-42e5-81b3-4d9ac0ce5edd",s._sentryDebugIdIdentifier="sentry-dbid-a2788feb-0aba-42e5-81b3-4d9ac0ce5edd")}catch{}})();function c(s){const e=u({queryKey:["user-subroles",s],queryFn:async()=>{if(!s)return[];const{data:a,error:n}=await l.from("user_subroles").select(`
          id,
          user_id,
          subrole_id,
          status,
          credential_notes,
          credential_document_url,
          admin_notes,
          reviewed_at,
          created_at,
          subrole_definitions!inner (
            slug,
            display_name
          )
        `).eq("user_id",s);if(n)throw console.error("[useUserSubroles] Error:",n),n;return(a||[]).map(i=>({id:i.id,user_id:i.user_id,subrole_id:i.subrole_id,slug:i.subrole_definitions.slug,display_name:i.subrole_definitions.display_name,status:i.status,credential_notes:i.credential_notes,credential_document_url:i.credential_document_url,admin_notes:i.admin_notes,reviewed_at:i.reviewed_at,created_at:i.created_at}))},staleTime:3e5,enabled:!!s}),t=e.data||[],o=t.filter(a=>a.status==="approved").map(a=>a.slug);return{data:t,approvedSlugs:o,isLoading:e.isLoading,error:e.error}}function _(s){const{approvedSlugs:e,isLoading:t}=c(s);return d.useMemo(()=>({canBuildPrograms:r(e,"canBuildPrograms"),canAssignWorkouts:r(e,"canAssignWorkouts"),canEditNutritionIfNoDietitian:r(e,"canEditNutritionIfNoDietitian"),canEditNutritionOverride:r(e,"canEditNutritionOverride"),canWriteInjuryNotes:r(e,"canWriteInjuryNotes"),canWritePsychNotes:r(e,"canWritePsychNotes"),isDietitian:e.includes("dietitian"),isPhysiotherapist:e.includes("physiotherapist"),isSportsPhysiologist:e.includes("sports_psychologist"),isMobilityCoach:e.includes("mobility_coach"),approvedSlugs:e,isLoading:t}),[e,t])}const f=Object.freeze(Object.defineProperty({__proto__:null,useSubrolePermissions:_},Symbol.toStringTag,{value:"Module"}));export{_ as a,f as b,c as u};
//# sourceMappingURL=useSubrolePermissions-ds0zVCnz.js.map
