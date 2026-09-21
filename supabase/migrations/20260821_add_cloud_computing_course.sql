-- Add Cloud Computing to the published course catalog.

do $$
declare
  course_modules jsonb := jsonb_build_array(
    jsonb_build_object(
      'id', 'cloud-computing-foundations',
      'title', 'Module 1: Cloud Computing Foundations',
      'description', 'Understand cloud service models, deployment models, core infrastructure, and the business value of cloud platforms.',
      'type', 'Drive Course Folder',
      'order_index', 1,
      'lessons', jsonb_build_array(
        jsonb_build_object(
          'id', 'cloud-computing-drive-folder',
          'title', 'Cloud Computing Course Materials',
          'description', 'Drive folder containing the Cloud Computing lectures, notes, and course resources.',
          'type', 'Drive Folder',
          'order_index', 1,
          'drive_link', 'https://drive.google.com/drive/folders/10TwRB1W8ofYV4SleOCNxwowMA8LyEdyZ?usp=sharing',
          'google_drive_link', 'https://drive.google.com/drive/folders/10TwRB1W8ofYV4SleOCNxwowMA8LyEdyZ?usp=sharing',
          'resource_url', 'https://drive.google.com/drive/folders/10TwRB1W8ofYV4SleOCNxwowMA8LyEdyZ?usp=sharing'
        )
      ),
      'quiz', jsonb_build_object(
        'id', 'cloud-computing-foundations-quiz',
        'title', 'Cloud Computing Foundations Check',
        'pass_score', 4,
        'random_count', 5,
        'questions', jsonb_build_array(
          jsonb_build_object('id', 'cloud-q1', 'question', 'What is cloud computing?', 'options', jsonb_build_array('On-demand delivery of computing resources over the internet', 'A local-only storage device', 'A spreadsheet format', 'A type of keyboard'), 'answer', 'On-demand delivery of computing resources over the internet', 'marks', 1),
          jsonb_build_object('id', 'cloud-q2', 'question', 'Which model provides virtual machines, storage, and networks?', 'options', jsonb_build_array('IaaS', 'HTML', 'CRM only', 'PDF'), 'answer', 'IaaS', 'marks', 1),
          jsonb_build_object('id', 'cloud-q3', 'question', 'Which cloud model is dedicated to one organization?', 'options', jsonb_build_array('Private cloud', 'Public blog', 'Open worksheet', 'Local printer'), 'answer', 'Private cloud', 'marks', 1),
          jsonb_build_object('id', 'cloud-q4', 'question', 'What is a common benefit of cloud platforms?', 'options', jsonb_build_array('Elastic scaling', 'No internet ever', 'Manual server purchase only', 'Fixed capacity forever'), 'answer', 'Elastic scaling', 'marks', 1),
          jsonb_build_object('id', 'cloud-q5', 'question', 'What should teams monitor in cloud environments?', 'options', jsonb_build_array('Cost, security, performance, and availability', 'Only font sizes', 'Only file names', 'Only page colors'), 'answer', 'Cost, security, performance, and availability', 'marks', 1)
        )
      )
    )
  );
begin
  if exists (select 1 from public.courses where lower(trim(title)) = 'cloud computing') then
    update public.courses
    set
      description = 'A practical introduction to cloud computing concepts, service models, deployment models, cloud infrastructure, security basics, cost awareness, and hands-on resources from the course Drive folder.',
      category = 'Cyber Security, Cloud & DevOps',
      duration = 'Drive folder course',
      module_type = 'Drive folder + quiz',
      instructor_name = coalesce(nullif(instructor_name, ''), 'Jenovate Mentor'),
      rating = coalesce(nullif(rating, ''), '4.8'),
      price = coalesce(price, 0),
      difficulty = 'Beginner',
      modules = course_modules,
      status = 'Published',
      is_featured = true,
      is_my_course = false,
      created_by_admin = true,
      quiz_pass_score = 4,
      google_form_url = 'https://drive.google.com/drive/folders/10TwRB1W8ofYV4SleOCNxwowMA8LyEdyZ?usp=sharing'
    where lower(trim(title)) = 'cloud computing';
  else
    insert into public.courses (
      title,
      description,
      category,
      duration,
      module_type,
      instructor_name,
      rating,
      price,
      difficulty,
      modules,
      status,
      is_featured,
      is_my_course,
      created_by_admin,
      quiz_pass_score,
      google_form_url,
      created_at
    )
    values (
      'Cloud Computing',
      'A practical introduction to cloud computing concepts, service models, deployment models, cloud infrastructure, security basics, cost awareness, and hands-on resources from the course Drive folder.',
      'Cyber Security, Cloud & DevOps',
      'Drive folder course',
      'Drive folder + quiz',
      'Jenovate Mentor',
      '4.8',
      0,
      'Beginner',
      course_modules,
      'Published',
      true,
      false,
      true,
      4,
      'https://drive.google.com/drive/folders/10TwRB1W8ofYV4SleOCNxwowMA8LyEdyZ?usp=sharing',
      now()
    );
  end if;
end $$;
