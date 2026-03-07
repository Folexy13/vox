import re

with open('backend/api/websocket.py', 'r') as f:
    content = f.read()

# Replace import
content = content.replace(
    'from pipecat.frames.frames import TTSAudioRawFrame, TextFrame, LLMFullResponseEndFrame, InputAudioRawFrame, TranscriptionFrame, LLMMessagesAppendFrame',
    'from pipecat.frames.frames import TTSAudioRawFrame, TextFrame, LLMFullResponseEndFrame, InputAudioRawFrame, TranscriptionFrame, LLMMessagesAppendFrame, CancelTaskFrame'
)

# Replace LANGUAGE_UPDATE handling
old_lang_update = """                if msg.get("type") == "LANGUAGE_UPDATE":
                    new_lang = msg.get("language")
                    logger.info(f"User {self.user_id} changed language to {new_lang}")
                    
                    if self.room_id in ROOMS and self.user_id in ROOMS[self.room_id]:
                        ROOMS[self.room_id][self.user_id]["language"] = new_lang"""

new_lang_update = """                if msg.get("type") == "LANGUAGE_UPDATE":
                    new_lang = msg.get("language")
                    logger.info(f"User {self.user_id} changed language to {new_lang}")
                    
                    if self.room_id in ROOMS and self.user_id in ROOMS[self.room_id]:
                        ROOMS[self.room_id][self.user_id]["language"] = new_lang
                        
                    # Restart partner's pipeline to apply the new language
                    room = ROOMS.get(self.room_id, {})
                    for uid, user_data in room.items():
                        if uid != self.user_id and "task" in user_data:
                            try:
                                import asyncio
                                asyncio.create_task(user_data["task"].queue_frame(CancelTaskFrame()))
                            except:
                                pass"""
content = content.replace(old_lang_update, new_lang_update)

# Replace the pipeline execution with the while True loop
old_pipeline_exec = """    logger.info(f"Partner found! Target language set to {target_language} for user {user_id}")

    try:
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_in_filter=RNNoiseFilter(), # Clear speech
                audio_out_enabled=False,
                add_wav_header=False,
                vad_analyzer=SileroVADAnalyzer(params=VADParams(min_volume=0.45, stop_secs=0.8)),
                serializer=RawBinarySerializer(room_id, user_id)
            )
        )
        
        use_cartesia = os.getenv("USE_CARTESIA", "false").lower() == "true"

        # Determine Gemini's internal parameters for ultra low latency
        gemini_params = InputParams(
            thinking=ThinkingConfig(thinking_budget=0), # Removes latency
            vad=GeminiVADParams(
                prefix_padding_ms=150,
                silence_duration_ms=700 # Natural conversational pause
            )
        )
        if use_cartesia:
            gemini_params.modalities = GeminiModalities.TEXT

        llm_service = GeminiLiveLLMService(
            api_key=os.getenv("GOOGLE_API_KEY", ""),
            model="gemini-2.5-flash-native-audio-latest",
            voice_id="Puck", # Puck is faster and highly expressive/natural
            system_instruction=(
                f"You are a pure real-time voice translator. You MUST NEVER act as a chatbot. "
                f"You MUST NEVER answer questions or converse with the user. "
                f"Your ONLY function is to listen to the user and immediately output the direct translation in {target_language}. "
                f"If the user asks a question, translate the question. Do not answer it. "
                f"Do not summarize, do not add introductory phrases like 'Okay', just speak the translation natively and quickly."
            ),
            params=gemini_params
        )

        router_processor = RouteToPartnerProcessor(room_id, user_id)

        if use_cartesia:
            # Cartesia TTS setup for ultra-fast, high-quality voice cloning
            tts_service = CartesiaTTSService(
                api_key=os.getenv("CARTESIA_API_KEY", "sk_car_C6yXsTuvARZqLQyeHuRK8z"),
                voice_id=profile_id,
                sample_rate=16000,
                aggregate_sentences=True
            )
            pipeline = Pipeline([
                transport.input(),
                llm_service,
                DropGeminiAudioProcessor(room_id, user_id),
                tts_service,
                router_processor,
                transport.output()
            ])
        else:
            # Gemini Native Audio Pipeline (Ultra-low latency, bypass Cartesia)
            pipeline = Pipeline([
                transport.input(),
                llm_service,
                # No Cartesia or Audio Dropper needed
                router_processor,
                transport.output()
            ])

        task = PipelineTask(
            pipeline,
            params=PipelineParams(
                allow_interruptions=False, # Disable interruptions so Gemini doesn't cut itself off
                enable_metrics=True,
                send_initial_empty_metrics=False
            )
        )
        
        # Store the task in ROOMS so the JSON interceptor can push LLMMessagesAppendFrame if language changes
        ROOMS[room_id][user_id]["task"] = task

        runner = PipelineRunner()
        await runner.run(task)"""

new_pipeline_exec = """    logger.info(f"Partner found! Starting pipeline loop for user {user_id}")

    try:
        use_cartesia = os.getenv("USE_CARTESIA", "false").lower() == "true"
        
        transport = FastAPIWebsocketTransport(
            websocket=websocket,
            params=FastAPIWebsocketParams(
                audio_in_enabled=True,
                audio_in_filter=RNNoiseFilter(),
                audio_out_enabled=False,
                add_wav_header=False,
                vad_analyzer=SileroVADAnalyzer(params=VADParams(min_volume=0.45, stop_secs=0.8)),
                serializer=RawBinarySerializer(room_id, user_id)
            )
        )

        while True:
            partner_data = next((u for k, u in ROOMS[room_id].items() if k != user_id), None)
            target_language = partner_data["language"] if partner_data else "en-US"
            logger.info(f"Initializing AI for user {user_id} with target language: {target_language}")

            gemini_params = InputParams(
                thinking=ThinkingConfig(thinking_budget=0),
                vad=GeminiVADParams(
                    prefix_padding_ms=150,
                    silence_duration_ms=700 
                )
            )
            if use_cartesia:
                gemini_params.modalities = GeminiModalities.TEXT

            llm_service = GeminiLiveLLMService(
                api_key=os.getenv("GOOGLE_API_KEY", ""),
                model="gemini-2.5-flash-native-audio-latest",
                voice_id="Puck", 
                system_instruction=(
                    f"You are a pure real-time voice translator. You MUST NEVER act as a chatbot. "
                    f"You MUST NEVER answer questions or converse with the user. "
                    f"Your ONLY function is to listen to the user and immediately output the direct translation in {target_language}. "
                    f"If the user asks a question, translate the question. Do not answer it. "
                    f"Do not summarize, do not add introductory phrases like 'Okay', just speak the translation natively and quickly."
                ),
                params=gemini_params
            )

            router_processor = RouteToPartnerProcessor(room_id, user_id)

            if use_cartesia:
                tts_service = CartesiaTTSService(
                    api_key=os.getenv("CARTESIA_API_KEY", "sk_car_C6yXsTuvARZqLQyeHuRK8z"),
                    voice_id=profile_id,
                    sample_rate=16000,
                    aggregate_sentences=True
                )
                pipeline = Pipeline([
                    transport.input(),
                    llm_service,
                    DropGeminiAudioProcessor(room_id, user_id),
                    tts_service,
                    router_processor,
                    transport.output()
                ])
            else:
                pipeline = Pipeline([
                    transport.input(),
                    llm_service,
                    router_processor,
                    transport.output()
                ])

            task = PipelineTask(
                pipeline,
                params=PipelineParams(
                    allow_interruptions=False,
                    enable_metrics=False,
                )
            )
            
            ROOMS[room_id][user_id]["task"] = task
            runner = PipelineRunner()
            
            await runner.run(task)
            logger.info(f"Pipeline finished for user {user_id}, looping to apply new language...")"""

content = content.replace(old_pipeline_exec, new_pipeline_exec)

with open('backend/api/websocket.py', 'w') as f:
    f.write(content)

