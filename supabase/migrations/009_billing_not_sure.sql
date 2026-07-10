-- "Not sure yet" option for family billing model

alter type billing_model add value if not exists 'not_sure';

notify pgrst, 'reload schema';
