import{u as l}from"./vendor-query-BBZgVvHg.js";import{s as d}from"./index-DlruBUhV.js";import{f as s,s as u}from"./format-rG-lgheD.js";import{e as c}from"./endOfWeek-CngZzDpQ.js";import{s as m}from"./startOfMonth-D-Ea-s4x.js";import{e as _}from"./endOfMonth-COuTTINN.js";(function(){try{var e=typeof window<"u"?window:typeof global<"u"?global:typeof globalThis<"u"?globalThis:typeof self<"u"?self:{};e.SENTRY_RELEASE={id:"development"};var t=new e.Error().stack;t&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[t]="43c3dcca-f834-4869-a60f-42737703e920",e._sentryDebugIdIdentifier="sentry-dbid-43c3dcca-f834-4869-a60f-42737703e920")}catch{}})();const y=3e4;function b(e,t){const r=s(t,"yyyy-MM");return l({queryKey:["client-workouts",e,"month",r],enabled:!!e,staleTime:y,refetchOnWindowFocus:!0,queryFn:async()=>{const n=m(t),i=_(t),{data:a,error:o}=await d.from("client_program_days").select(`
          id,
          date,
          title,
          client_programs!inner (
            user_id,
            status
          ),
          client_day_modules (
            id,
            title,
            module_type,
            status
          )
        `).eq("client_programs.user_id",e).eq("client_programs.status","active").gte("date",s(n,"yyyy-MM-dd")).lte("date",s(i,"yyyy-MM-dd"));if(o)throw o;return a??[]}})}function q(e){const t=s(new Date,"yyyy-MM-dd");return l({queryKey:["client-workouts",e,"today",t],enabled:!!e,staleTime:y,refetchOnWindowFocus:!0,queryFn:async()=>{const{data:r,error:n}=await d.from("client_programs").select(`
          id,
          status,
          source_template_id,
          client_program_days (
            id,
            title,
            day_index,
            date,
            client_day_modules (
              id,
              title,
              module_type,
              status,
              sort_order,
              client_module_exercises (count)
            )
          )
        `).eq("user_id",e).eq("status","active").order("start_date",{ascending:!1}).limit(1).maybeSingle();if(n)throw n;if(!r)return{program:null,programName:null};let i="Your Program";if(r.source_template_id){const{data:a,error:o}=await d.from("program_templates").select("title").eq("id",r.source_template_id).maybeSingle();o?console.warn("[useClientWorkoutsToday] template lookup failed:",o.message):a!=null&&a.title&&(i=a.title)}return{program:r,programName:i}}})}function h(e,t=new Date){const r=u(t,{weekStartsOn:1}),n=c(t,{weekStartsOn:1}),i=s(r,"yyyy-MM-dd");return l({queryKey:["client-workouts",e,"week",i],enabled:!!e,staleTime:y,refetchOnWindowFocus:!0,queryFn:async()=>{const{data:a,error:o}=await d.from("client_day_modules").select(`
          id,
          module_type,
          status,
          completed_at,
          client_program_days!inner (
            date,
            client_programs!inner (
              user_id,
              status
            )
          )
        `).eq("client_program_days.client_programs.user_id",e).eq("client_program_days.client_programs.status","active").gte("client_program_days.date",s(r,"yyyy-MM-dd")).lte("client_program_days.date",s(n,"yyyy-MM-dd"));if(o)throw o;return a??[]}})}export{h as a,b,q as u};
//# sourceMappingURL=useClientWorkouts-BzhWvqJa.js.map
