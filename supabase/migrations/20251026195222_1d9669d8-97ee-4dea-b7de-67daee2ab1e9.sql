-- Mark abdulrazzaqmajeed10@gmail.com as payment exempt and activate account
UPDATE public.profiles
SET 
  payment_exempt = true,
  status = 'active',
  payment_deadline = NULL
WHERE email = 'abdulrazzaqmajeed10@gmail.com';

-- Activate their subscription
UPDATE public.subscriptions
SET 
  status = 'active',
  start_date = NOW()
WHERE user_id = (SELECT id FROM public.profiles WHERE email = 'abdulrazzaqmajeed10@gmail.com');