import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

import '../../logic/services/welcome_service.dart';

part 'welcome_state.dart';

class WelcomeCubit extends Cubit<WelcomeState> {
  WelcomeCubit() : super(WelcomeInitial());

  void getPosition() async {
    emit(WelcomeLoading());
    try {
      // Chrome / web: location often blocked — don't trap users on welcome
      if (kIsWeb) {
        emit(WelcomeSuccess());
        return;
      }
      WelcomeService.determinePosition()
          .then((position) {
            emit(WelcomeSuccess());
          })
          .catchError((error) {
            // Still allow continue — GPS asked again on home when going online
            emit(WelcomeSuccess());
          });
    } catch (e) {
      emit(WelcomeSuccess());
    }
  }

  void skipLocation() {
    emit(WelcomeSuccess());
  }
}
